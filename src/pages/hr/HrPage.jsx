import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { nextDocNumber } from '../../utils/docNumbers'
import {
  Users, Plus, X, Loader2, Save, Trash2, Edit2,
  Phone, Calendar, CreditCard, FileText,
  CheckCircle, Banknote, BarChart2, Search, Mail, UserPlus, Link, Copy,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, getDaysInMonth, parseISO } from 'date-fns'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  'Plant & Machinery (P&M)', 'Projects', 'Site / Field', 'Transport',
  'Admin', 'Accounts', 'Management', 'Other'
]

const DESIGNATIONS = [
  'Equipment Operator', 'Tipper / Dumper Driver', 'Site Supervisor',
  'P&M Manager', 'Project Manager', 'Admin Executive', 'Accounts Executive',
  'HR Executive', 'Management', 'Labour', 'Helper', 'Other'
]

const EMP_TYPES = [
  { value: 'shift',   label: 'Shift-based',    desc: 'Paid per shift worked',            icon: '🔄' },
  { value: 'daily',   label: 'Daily Wage',      desc: 'Paid per day present',             icon: '📅' },
  { value: 'monthly', label: 'Monthly Salary',  desc: 'Fixed monthly, prorated absences', icon: '📆' },
]

const LEAVE_TYPES = [
  { value: 'casual',  label: 'Casual Leave (CL)',  color: 'text-blue-400' },
  { value: 'earned',  label: 'Earned Leave (EL)',  color: 'text-emerald-400' },
  { value: 'sick',    label: 'Sick Leave (SL)',    color: 'text-yellow-400' },
  { value: 'unpaid',  label: 'Unpaid Leave (LOP)', color: 'text-red-400' },
]

const ATTENDANCE_STATUS = [
  { value: 'present',  full: 'Present',   cls: 'bg-emerald-500/15 text-emerald-700 border-emerald-600/40' },
  { value: 'absent',   full: 'Absent',    cls: 'bg-red-500/15 text-red-700 border-red-600/40' },
  { value: 'half_day', full: 'Half Day',  cls: 'bg-yellow-500/15 text-yellow-700 border-yellow-600/40' },
  { value: 'leave',    full: 'Leave',     cls: 'bg-blue-500/15 text-blue-700 border-blue-600/40' },
  { value: 'week_off', full: 'Week Off',  cls: 'bg-slate-500/10 text-slate-600 border-slate-400/40' },
  { value: 'holiday',  full: 'Holiday',   cls: 'bg-purple-500/15 text-purple-700 border-purple-600/40' },
]

const WAGE_CATEGORIES = [
  { value: 'unskilled',      label: 'Unskilled' },
  { value: 'semi_skilled',   label: 'Semi-skilled' },
  { value: 'skilled',        label: 'Skilled' },
  { value: 'highly_skilled', label: 'Highly Skilled' },
  { value: 'supervisory',    label: 'Supervisory / Clerical' },
]

// ── Labour law helpers ────────────────────────────────────────────────────────
// Child Labour (Prohibition & Regulation) Act + BOCW Act: min 18 yrs for construction
function calcAge(dob) {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// Years of service from joining date
function yearsOfService(joiningDate) {
  if (!joiningDate) return 0
  return (new Date() - new Date(joiningDate)) / (365.25 * 24 * 60 * 60 * 1000)
}

// Payment of Gratuity Act, 1972: eligible after 5 years, 15/26 × basic × years
function calcGratuity(joiningDate, basicSalary) {
  const yrs = yearsOfService(joiningDate)
  if (yrs < 5) return null
  return Math.round((Number(basicSalary || 0) * 15 / 26) * Math.floor(yrs))
}

// Payment of Bonus Act, 1965: min 8.33% on wage base ≤ ₹7,000 if gross ≤ ₹21,000
function calcMinBonus(basicOrRate) {
  const base = Math.min(Number(basicOrRate || 0), 7000)
  return Math.round(base * 0.0833)
}

function calcPT(grossMonthly) {
  if (grossMonthly <= 21000) return 0
  if (grossMonthly <= 30000) return 135
  if (grossMonthly <= 45000) return 315
  if (grossMonthly <= 60000) return 690
  if (grossMonthly <= 75000) return 1025
  return 1250
}

// ── Shift attendance helpers ──────────────────────────────────────────────────
// Returns decimal hours between two 'HH:MM' strings. Handles cross-midnight.
function calcShiftHours(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let startMins = sh * 60 + sm
  let endMins   = eh * 60 + em
  if (endMins <= startMins) endMins += 24 * 60   // cross-midnight shift
  return Math.round((endMins - startMins) / 60 * 10) / 10
}

// < 4 hrs → half_day, ≥ 4 hrs → present
function calcShiftStatus(hours) {
  if (hours <= 0) return null
  return hours < 4 ? 'half_day' : 'present'
}
// OT = hours beyond threshold (default 12; configurable per company)
function calcOtHours(hours, threshold = 12) {
  return hours > threshold ? Math.round((hours - threshold) * 10) / 10 : 0
}

// Designations that must use clock-in / clock-out (regardless of pay type)
const SHIFT_CLOCK_DESIGNATIONS = [
  'Equipment Operator', 'Tipper / Dumper Driver', 'Site Supervisor',
  'P&M Manager', 'Labour', 'Helper',
]

function isShiftWorker(emp) {
  return emp.employment_type === 'shift' ||
    SHIFT_CLOCK_DESIGNATIONS.includes(emp.designation)
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function inp(extra = '') {
  return `w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 ${extra}`
}

function Field({ label, required, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function SectionHeader({ label, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {Icon && <Icon className="w-3.5 h-3.5 text-primary-400" />}
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-dark-600" />
    </div>
  )
}

function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl flex flex-col max-h-[92vh]`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700 shrink-0">
          <h2 className="font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">{children}</div>
        {footer && <div className="flex gap-2 px-4 py-3 border-t border-dark-700 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}

// ── Employee Form Modal ───────────────────────────────────────────────────────
function EmployeeFormModal({ companyId, initialValues, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!initialValues?.id

  const blank = {
    name: '', designation: '', department: '', employment_type: 'monthly',
    status: 'active', joining_date: '', date_of_birth: '',
    phone: '', email: '', address: '',
    aadhar_number: '', pan_number: '',
    bank_account: '', bank_name: '', ifsc_code: '',
    uan_number: '', esi_number: '',
    pf_applicable: false, esi_applicable: false, pt_applicable: true,
    bonus_applicable: false, gratuity_applicable: true,
    bocw_number: '', min_wage_category: 'unskilled',
    notes: '',
    basic_salary: '', hra: '', special_allowance: '', other_allowance: '',
    daily_rate: '',
    day_shift_rate: '', night_shift_rate: '', double_shift_rate: '', ot_rate_per_hour: '',
    user_id: '',
    login_email: '', login_password: '', login_role: 'operator', showLoginPwd: false,
  }

  const [form, setForm] = useState(() => ({ ...blank, ...initialValues }))
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('basic')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Fetch all login accounts for this company to show in "Link Account" dropdown
  const { data: companyUsers = [] } = useQuery({
    queryKey: ['company_users', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles')
        .select('user_id, full_name, email, role')
        .eq('company_id', companyId)
        .order('full_name')
      return data || []
    },
    enabled: !!companyId && tab === 'compliance',
  })

  const grossMonthly = Number(form.basic_salary || 0) + Number(form.hra || 0) +
    Number(form.special_allowance || 0) + Number(form.other_allowance || 0)

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (form.date_of_birth) {
      const age = calcAge(form.date_of_birth)
      if (age < 18) {
        toast.error(`Age ${age} — minimum age is 18 years (Child Labour Act / BOCW Act)`)
        return
      }
    }
    setSaving(true)
    try {
      let empNumber = form.employee_number
      if (!isEdit && !empNumber) {
        empNumber = await nextDocNumber(companyId, 'employee').catch(() => `EMP-${Date.now()}`)
      }

      const payload = {
        company_id: companyId, name: form.name.trim(),
        employee_number: empNumber,
        designation: form.designation || null, department: form.department || null,
        employment_type: form.employment_type, status: form.status,
        joining_date: form.joining_date || null, date_of_birth: form.date_of_birth || null,
        phone: form.phone || null, email: form.email || null, address: form.address || null,
        aadhar_number: form.aadhar_number || null, pan_number: form.pan_number || null,
        bank_account: form.bank_account || null, bank_name: form.bank_name || null,
        ifsc_code: form.ifsc_code || null,
        uan_number: form.uan_number || null, esi_number: form.esi_number || null,
        pf_applicable: form.pf_applicable, esi_applicable: form.esi_applicable,
        pt_applicable: form.pt_applicable,
        bonus_applicable: form.bonus_applicable, gratuity_applicable: form.gratuity_applicable,
        bocw_number: form.bocw_number || null, min_wage_category: form.min_wage_category || 'unskilled',
        notes: form.notes || null,
        user_id: form.user_id || null,
      }

      let empId = initialValues?.id
      if (isEdit) {
        const { error } = await supabase.from('hr_employees').update(payload).eq('id', empId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('hr_employees').insert(payload).select().single()
        if (error) throw error
        empId = data.id
      }

      const hasAnySalary = form.basic_salary || form.daily_rate || form.day_shift_rate
      if (hasAnySalary) {
        const salPayload = {
          company_id: companyId, employee_id: empId,
          effective_from: form.joining_date || new Date().toISOString().split('T')[0],
          basic_salary: Number(form.basic_salary || 0),
          hra: Number(form.hra || 0),
          special_allowance: Number(form.special_allowance || 0),
          other_allowance: Number(form.other_allowance || 0),
          daily_rate: Number(form.daily_rate || 0),
          day_shift_rate: Number(form.day_shift_rate || 0),
          night_shift_rate: Number(form.night_shift_rate || 0),
          double_shift_rate: Number(form.double_shift_rate || 0),
          ot_rate_per_hour: Number(form.ot_rate_per_hour || 0),
        }
        const { data: existing } = await supabase.from('hr_salary_structure')
          .select('id').eq('employee_id', empId)
          .order('effective_from', { ascending: false }).limit(1).maybeSingle()
        if (existing) {
          await supabase.from('hr_salary_structure').update(salPayload).eq('id', existing.id)
        } else {
          await supabase.from('hr_salary_structure').insert(salPayload)
        }
      }

      // Create login account if email + password provided
      const loginEmail = (form.login_email || form.email || '').trim().toLowerCase()
      const loginPwd   = (form.login_password || '').trim()
      if (loginEmail && loginPwd.length >= 6 && !form.user_id) {
        const { data: loginData, error: loginErr } = await supabase.functions.invoke('create-employee-login', {
          body: {
            email: loginEmail,
            full_name: form.name.trim(),
            role: form.login_role || 'operator',
            employee_id: empId,
            company_id: companyId,
            password: loginPwd,
          },
        })
        if (loginErr || !loginData?.success) {
          toast.success(isEdit ? 'Employee updated' : 'Employee added')
          toast.error(`Login setup failed: ${loginData?.error || loginErr?.message} — set password manually from employee profile`)
        } else {
          toast.success(`${isEdit ? 'Employee updated' : 'Employee added'} — login created!`)
        }
      } else {
        toast.success(isEdit ? 'Employee updated' : 'Employee added')
      }

      qc.invalidateQueries(['hr_employees', companyId])
      qc.invalidateQueries(['hr_employees_active', companyId])
      qc.invalidateQueries(['hr_emp_count', companyId])
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const tabCls = (t) => `px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t
    ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`

  return (
    <Modal title={isEdit ? `Edit — ${initialValues.name}` : 'Add Employee'} onClose={onClose} wide footer={
      <>
        <button onClick={onClose} className="flex-1 btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary flex items-center justify-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><Save className="w-4 h-4" />{isEdit ? 'Update' : 'Add Employee'}</>}
        </button>
      </>
    }>
      <div className="flex border-b border-dark-700 -mx-4 px-4 mb-1">
        {['basic', 'salary', 'compliance'].map(t => (
          <button key={t} className={tabCls(t)} onClick={() => setTab(t)}>
            {t === 'basic' ? 'Basic Info' : t === 'salary' ? 'Salary' : 'Compliance & Bank'}
          </button>
        ))}
      </div>

      {/* ── Basic ── */}
      {tab === 'basic' && (<>
        <Field label="How is this employee paid?" required>
          <div className="grid grid-cols-3 gap-2">
            {EMP_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => set('employment_type', t.value)}
                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border text-center transition-all
                  ${form.employment_type === t.value
                    ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                    : 'border-dark-600 bg-dark-700 text-slate-400 hover:border-dark-500'}`}>
                <span className="text-lg">{t.icon}</span>
                <span className="text-xs font-semibold">{t.label}</span>
                <span className="text-[10px] text-slate-500 leading-tight">{t.desc}</span>
              </button>
            ))}
          </div>
        </Field>

        {/* Employee Number */}
        {isEdit && form.employee_number && (
          <div className="bg-primary-900/20 border border-primary-700/30 rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">Employee Number</span>
            <span className="font-mono font-bold text-primary-300 text-sm">{form.employee_number}</span>
          </div>
        )}
        {!isEdit && (
          <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">Employee Number</span>
            <span className="text-xs text-slate-500 italic">Auto-assigned on save (e.g. EMP-001)</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name" required>
            <input className={inp()} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Employee full name" />
          </Field>
          <Field label="Status">
            <select className={inp()} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Designation">
            <select className={inp()} value={form.designation} onChange={e => set('designation', e.target.value)}>
              <option value="">Select…</option>
              {DESIGNATIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select className={inp()} value={form.department} onChange={e => set('department', e.target.value)}>
              <option value="">Select…</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Joining Date">
            <input type="date" className={inp()} value={form.joining_date} onChange={e => set('joining_date', e.target.value)} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" className={inp()} value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
            {form.date_of_birth && (() => {
              const age = calcAge(form.date_of_birth)
              return age < 18
                ? <p className="text-xs text-red-400 mt-1">⚠ Age {age} — must be 18+ (BOCW Act)</p>
                : <p className="text-xs text-slate-500 mt-1">Age: {age} years</p>
            })()}
          </Field>
        </div>

        <SectionHeader label="Contact" icon={Phone} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input className={inp()} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" />
          </Field>
          <Field label="Email">
            <input className={inp()} value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email address" />
          </Field>
        </div>
        <Field label="Address">
          <textarea className={inp('resize-none')} rows={2} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Residential address" />
        </Field>
        <Field label="Notes">
          <textarea className={inp('resize-none')} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional info…" />
        </Field>
      </>)}

      {/* ── Salary ── */}
      {tab === 'salary' && (<>
        <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <span className="text-xl">{EMP_TYPES.find(t => t.value === form.employment_type)?.icon}</span>
          <div>
            <p className="text-sm font-medium text-slate-200">{EMP_TYPES.find(t => t.value === form.employment_type)?.label}</p>
            <p className="text-xs text-slate-500">{EMP_TYPES.find(t => t.value === form.employment_type)?.desc}</p>
          </div>
          <button onClick={() => setTab('basic')} className="ml-auto text-xs text-primary-400 hover:text-primary-300">Change</button>
        </div>

        {form.employment_type === 'monthly' && (<>
          <SectionHeader label="Monthly Salary Components" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Basic Salary (₹)">
              <input type="number" className={inp()} value={form.basic_salary} onChange={e => set('basic_salary', e.target.value)} placeholder="0" />
            </Field>
            <Field label="HRA (₹)">
              <input type="number" className={inp()} value={form.hra} onChange={e => set('hra', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Special Allowance (₹)">
              <input type="number" className={inp()} value={form.special_allowance} onChange={e => set('special_allowance', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Other Allowance (₹)">
              <input type="number" className={inp()} value={form.other_allowance} onChange={e => set('other_allowance', e.target.value)} placeholder="0" />
            </Field>
          </div>
          {grossMonthly > 0 && (
            <div className="bg-primary-900/20 border border-primary-700/30 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Gross Monthly</span>
                <span className="font-bold text-primary-300">₹{grossMonthly.toLocaleString('en-IN')}</span>
              </div>
              {form.pf_applicable && <div className="flex justify-between text-xs text-slate-400"><span>PF (12% of basic)</span><span>−₹{Math.round(Number(form.basic_salary || 0) * 0.12).toLocaleString('en-IN')}</span></div>}
              {form.esi_applicable && grossMonthly <= 21000 && <div className="flex justify-between text-xs text-slate-400"><span>ESI (0.75%)</span><span>−₹{Math.round(grossMonthly * 0.0075).toLocaleString('en-IN')}</span></div>}
              {form.pt_applicable && <div className="flex justify-between text-xs text-slate-400"><span>Professional Tax</span><span>−₹{calcPT(grossMonthly).toLocaleString('en-IN')}</span></div>}
              <div className="flex justify-between text-sm font-semibold border-t border-dark-600 pt-1">
                <span className="text-slate-300">Est. Net Pay</span>
                <span className="text-emerald-400">₹{Math.round(
                  grossMonthly
                  - (form.pf_applicable ? Number(form.basic_salary || 0) * 0.12 : 0)
                  - (form.esi_applicable && grossMonthly <= 21000 ? grossMonthly * 0.0075 : 0)
                  - (form.pt_applicable ? calcPT(grossMonthly) : 0)
                ).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
        </>)}

        {form.employment_type === 'daily' && (<>
          <SectionHeader label="Daily Wage Rate" />
          <Field label="Daily Rate (₹ per day)" required>
            <input type="number" className={inp()} value={form.daily_rate} onChange={e => set('daily_rate', e.target.value)} placeholder="e.g. 800" />
          </Field>
          {Number(form.daily_rate) > 0 && (
            <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs text-slate-400">
              26 working days → <span className="text-slate-200 font-semibold">₹{(Number(form.daily_rate) * 26).toLocaleString('en-IN')}/month approx</span>
            </div>
          )}
        </>)}

        {form.employment_type === 'shift' && (<>
          <SectionHeader label="Shift Rates" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day Shift Rate (₹)">
              <input type="number" className={inp()} value={form.day_shift_rate} onChange={e => set('day_shift_rate', e.target.value)} placeholder="e.g. 600" />
            </Field>
            <Field label="Night Shift Rate (₹)">
              <input type="number" className={inp()} value={form.night_shift_rate} onChange={e => set('night_shift_rate', e.target.value)} placeholder="e.g. 700" />
            </Field>
            <Field label="Double Shift Rate (₹)">
              <input type="number" className={inp()} value={form.double_shift_rate} onChange={e => set('double_shift_rate', e.target.value)} placeholder="e.g. 1100" />
            </Field>
            <Field label="OT Rate / Hour (₹)">
              <input type="number" className={inp()} value={form.ot_rate_per_hour} onChange={e => set('ot_rate_per_hour', e.target.value)} placeholder="e.g. 100" />
            </Field>
          </div>
        </>)}

        {form.employment_type !== 'shift' && (
          <Field label="OT Rate per Hour (₹)">
            <input type="number" className={inp()} value={form.ot_rate_per_hour} onChange={e => set('ot_rate_per_hour', e.target.value)} placeholder="0" />
          </Field>
        )}
      </>)}

      {/* ── Compliance & Bank ── */}
      {tab === 'compliance' && (<>
        {/* App Login — inline creation */}
        <SectionHeader label="App Login" icon={Users} />
        {isEdit && form.user_id ? (
          <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-3 flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            Login account linked. Use "Set Password" from employee detail to change password.
          </div>
        ) : (
          <div className="bg-dark-700 rounded-xl p-3 space-y-3">
            <p className="text-xs text-slate-400">
              {isEdit ? "Create a login account for this employee. Share credentials via WhatsApp." : "Optionally create a login account now. You can also do this later from the employee profile."}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Login Email">
                <input type="email" className={inp()} value={form.login_email || form.email || ''} onChange={e => set('login_email', e.target.value)} placeholder="employee@gmail.com" />
              </Field>
              <Field label="App Role">
                <select className={inp()} value={form.login_role || 'operator'} onChange={e => set('login_role', e.target.value)}>
                  <option value="operator">Operator — daily operations only</option>
                  <option value="supervisor">Supervisor — operations, fleet, projects</option>
                  <option value="manager">Manager — full access</option>
                  <option value="accounts">Accounts — invoices, expenses</option>
                </select>
              </Field>
            </div>
            <Field label="Password">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={form.showLoginPwd ? 'text' : 'password'} className={`${inp()} pr-14 font-mono`}
                    value={form.login_password || ''} onChange={e => set('login_password', e.target.value)}
                    placeholder="Min. 6 characters"
                  />
                  <button type="button" onClick={() => set('showLoginPwd', !form.showLoginPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs">
                    {form.showLoginPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button type="button"
                  onClick={() => { const d = Math.floor(1000+Math.random()*9000); set('login_password', `Nhance@${d}`); set('showLoginPwd', true) }}
                  className="px-3 py-2 rounded-lg bg-dark-600 border border-dark-500 text-xs text-cyan-400 hover:bg-dark-500 whitespace-nowrap">
                  Auto-gen
                </button>
              </div>
            </Field>
            {(form.login_email || form.email) && form.login_password && (
              <p className="text-xs text-emerald-400">✓ Login will be created when you save the employee.</p>
            )}
          </div>
        )}

        <SectionHeader label="Statutory Deductions" icon={FileText} />
        <div className="space-y-2">
          {[
            { key: 'pf_applicable',       label: 'PF Applicable',                desc: '12% employee + 12% employer on basic (EPF Act 1952)' },
            { key: 'esi_applicable',      label: 'ESI Applicable',               desc: '0.75% employee + 3.25% employer (gross ≤ ₹21,000)' },
            { key: 'pt_applicable',       label: 'Professional Tax Applicable',   desc: 'Slab-based monthly deduction' },
            { key: 'bonus_applicable',    label: 'Bonus Applicable',             desc: 'Payment of Bonus Act — min 8.33% (gross ≤ ₹21,000)' },
            { key: 'gratuity_applicable', label: 'Gratuity Applicable',          desc: 'Payment of Gratuity Act — eligible after 5 years service' },
          ].map(item => (
            <label key={item.key} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={form[item.key]} onChange={e => set(item.key, e.target.checked)}
                className="w-4 h-4 rounded accent-primary-500" />
              <div>
                <p className="text-sm font-medium text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <SectionHeader label="BOCW & Wage Category" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="BOCW Registration No." hint="Building & Other Construction Workers Act, 1996">
            <input className={inp()} value={form.bocw_number} onChange={e => set('bocw_number', e.target.value)} placeholder="BOCW Reg. number" />
          </Field>
          <Field label="Wage Category" hint="For minimum wage compliance tracking">
            <select className={inp()} value={form.min_wage_category} onChange={e => set('min_wage_category', e.target.value)}>
              {WAGE_CATEGORIES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2 text-xs text-yellow-400">
          ⚠ Verify current minimum wages for your state from the Labour Department website — rates change periodically.
        </div>

        <SectionHeader label="Government IDs" icon={CreditCard} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aadhar Number">
            <input className={inp()} value={form.aadhar_number} onChange={e => set('aadhar_number', e.target.value)} placeholder="XXXX XXXX XXXX" />
          </Field>
          <Field label="PAN Number">
            <input className={inp('uppercase')} value={form.pan_number} onChange={e => set('pan_number', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
          </Field>
          <Field label="UAN Number (PF)">
            <input className={inp()} value={form.uan_number} onChange={e => set('uan_number', e.target.value)} placeholder="Universal Account No." />
          </Field>
          <Field label="ESI Number">
            <input className={inp()} value={form.esi_number} onChange={e => set('esi_number', e.target.value)} placeholder="ESI member no." />
          </Field>
        </div>

        <SectionHeader label="Bank Details" icon={Banknote} />
        <Field label="Bank Account Number">
          <input className={inp()} value={form.bank_account} onChange={e => set('bank_account', e.target.value)} placeholder="Account number" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank Name">
            <input className={inp()} value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="e.g. SBI, HDFC" />
          </Field>
          <Field label="IFSC Code">
            <input className={inp('uppercase')} value={form.ifsc_code} onChange={e => set('ifsc_code', e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} />
          </Field>
        </div>
      </>)}
    </Modal>
  )
}

// ── Create Login Modal (no email — admin sets password, shares via WhatsApp) ──
const LOGIN_ROLES = [
  { key: 'operator',   label: 'Operator — daily operations only' },
  { key: 'supervisor', label: 'Supervisor — operations, fleet, projects' },
  { key: 'manager',    label: 'Manager — full operations + business' },
  { key: 'accounts',   label: 'Accounts — invoices, expenses, ledger' },
  { key: 'admin',      label: 'Admin — full access including settings' },
]

function InviteAndLinkModal({ emp, companyId, onClose, onDone }) {
  const [email,    setEmail]    = useState(emp.email || '')
  const [role,     setRole]     = useState('operator')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)
  const [copied,   setCopied]   = useState(false)

  const generate = () => {
    const digits = Math.floor(1000 + Math.random() * 9000)
    setPassword(`Nhance@${digits}`)
    setShowPwd(true)
  }

  const handleCreate = async () => {
    if (!email.trim() || !email.includes('@')) return toast.error('Valid email required')
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-employee-login', {
        body: {
          email: email.trim().toLowerCase(),
          full_name: emp.name || emp.full_name,
          role,
          employee_id: emp.id,
          company_id: companyId,
          password,
        },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to create login')
      setDone(true)
    } catch (e) {
      toast.error(e.message || 'Failed to create login')
    } finally {
      setSaving(false)
    }
  }

  const copyWhatsApp = () => {
    const msg = `Hi ${emp.name || emp.full_name},\n\nYour Nhance login details:\nEmail: ${email}\nPassword: ${password}\n\nLogin at: https://nhance-app.vercel.app`
    navigator.clipboard.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied! Paste into WhatsApp')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-bold text-slate-100">Create Login — {emp.name || emp.full_name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {!done ? (
            <>
              <div className="bg-dark-700 rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-600/20 border border-primary-700/40 flex items-center justify-center text-sm font-bold text-primary-400">
                  {((emp.name || emp.full_name || 'E').split(' ').map(w => w[0]).join('').slice(0, 2)).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">{emp.name || emp.full_name}</p>
                  <p className="text-xs text-slate-500">{emp.designation || 'Employee'} · {emp.employee_number || ''}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email Address *</label>
                <input type="email"
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="employee@gmail.com" autoFocus />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">App Role *</label>
                <select className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                  value={role} onChange={e => setRole(e.target.value)}>
                  {LOGIN_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-slate-400">Password *</label>
                  <button onClick={generate} className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-primary-500 pr-14"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs">
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">You'll share this with the employee via WhatsApp — no email needed.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
                <button onClick={handleCreate} disabled={saving || !email || password.length < 6} className="btn-primary flex-1">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Login'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 text-center">
                <p className="text-emerald-400 font-semibold text-sm mb-1">✅ Login created & linked!</p>
                <p className="text-xs text-slate-400">{emp.name || emp.full_name} can now log in to Nhance.</p>
              </div>

              <div className="bg-dark-700 rounded-xl p-3 space-y-1.5 text-xs">
                <p className="text-slate-400 font-sans mb-2">Share via WhatsApp:</p>
                <div className="flex justify-between">
                  <span className="text-slate-400">Email</span>
                  <span className="text-slate-100 font-mono">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Password</span>
                  <span className="text-emerald-400 font-mono font-bold">{password}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">App</span>
                  <span className="text-slate-300">nhance-app.vercel.app</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={copyWhatsApp}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium">
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy for WhatsApp'}
                </button>
                <button onClick={onDone} className="btn-primary flex-1 justify-center">Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Set Password Modal (HR/Admin sets password, shares via WhatsApp) ───────────
function SetPasswordModal({ emp, onClose }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(false)
  const [copied, setCopied]     = useState(false)
  const [showPwd, setShowPwd]   = useState(false)

  // Auto-generate a simple password: Nhance + 4 random digits
  const generate = () => {
    const digits = Math.floor(1000 + Math.random() * 9000)
    setPassword(`Nhance@${digits}`)
    setShowPwd(true)
  }

  const handleSave = async () => {
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    if (!emp.user_id) return toast.error('No login account linked to this employee')
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('set-employee-password', {
        body: { user_id: emp.user_id, password },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to set password')
      setDone(true)
    } catch (e) {
      toast.error(e.message || 'Failed to set password')
    } finally {
      setSaving(false)
    }
  }

  const copyWhatsApp = () => {
    const msg = `Hi ${emp.name},\n\nYour Nhance login details:\nEmail: ${emp.email || '(your email)'}\nPassword: ${password}\n\nLogin at: https://nhance-app.vercel.app`
    navigator.clipboard.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('WhatsApp message copied!')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-xl border border-dark-700 shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-bold text-slate-100">Set Login Password — {emp.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {!done ? (
            <>
              {/* Employee info */}
              <div className="bg-dark-700 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Login email</span>
                  <span className="text-slate-200 font-mono">{emp.email || '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Employee</span>
                  <span className="text-slate-200">{emp.name} · {emp.employee_number}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-400">New Password</label>
                  <button onClick={generate} className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-primary-500 pr-10"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs">
                    {showPwd ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">You'll share this with the employee via WhatsApp or phone call — no email needed.</p>
              </div>

              <div className="flex gap-3">
                <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
                <button onClick={handleSave} disabled={saving || password.length < 6} className="btn-primary flex-1">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting…</> : 'Set Password'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 text-center">
                <p className="text-emerald-400 font-semibold text-sm mb-1">✅ Password set successfully!</p>
                <p className="text-xs text-slate-400">Share the login details with {emp.name} via WhatsApp.</p>
              </div>

              <div className="bg-dark-700 rounded-xl p-3 space-y-2 font-mono text-xs text-slate-300">
                <p className="text-slate-400 text-xs font-sans mb-1">WhatsApp message to send:</p>
                <p>Email: <span className="text-slate-100">{emp.email}</span></p>
                <p>Password: <span className="text-emerald-400 font-bold">{password}</span></p>
                <p className="text-slate-500 text-xs font-sans">nhance-app.vercel.app</p>
              </div>

              <div className="flex gap-3">
                <button onClick={copyWhatsApp}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30 text-sm font-medium">
                  {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy for WhatsApp'}
                </button>
                <button onClick={onClose} className="btn-primary flex-1 justify-center">Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Employee Card ──────────────────────────────────────────────────────────────
function EmployeeCard({ emp, onClick }) {
  const typeInfo = EMP_TYPES.find(t => t.value === emp.employment_type)
  return (
    <button onClick={onClick} className="w-full text-left bg-dark-800 border border-dark-700 hover:border-dark-500 rounded-xl p-3.5 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-100 text-sm truncate">{emp.name}</p>
          <p className="text-xs text-slate-500 truncate">{emp.designation || '—'}{emp.department ? ` · ${emp.department}` : ''}</p>
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border
          ${emp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40' : 'bg-dark-700 text-slate-500 border-dark-600'}`}>
          {emp.status}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
        <span className="font-mono text-primary-400">{emp.employee_number}</span>
        <span>{typeInfo?.icon} {typeInfo?.label}</span>
        {emp.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{emp.phone}</span>}
      </div>
    </button>
  )
}

// ── Employee Detail Modal ─────────────────────────────────────────────────────
function EmployeeDetailModal({ emp, companyId, onClose, onEdit }) {
  const { role } = useAuth()
  const qc = useQueryClient()
  const [delConfirm, setDelConfirm]   = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [showInvite, setShowInvite]   = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)

  const { data: salary } = useQuery({
    queryKey: ['hr_salary', emp.id],
    queryFn: async () => {
      const { data } = await supabase.from('hr_salary_structure')
        .select('*').eq('employee_id', emp.id).order('effective_from', { ascending: false }).limit(1).maybeSingle()
      return data
    },
  })

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('hr_employees').delete().eq('id', emp.id)
    if (error) { toast.error(error.message); setDeleting(false); return }
    toast.success(`${emp.name} removed`)
    qc.invalidateQueries(['hr_employees', companyId])
    qc.invalidateQueries(['hr_employees_active', companyId])
    qc.invalidateQueries(['hr_emp_count', companyId])
    onClose()
  }

  const typeInfo = EMP_TYPES.find(t => t.value === emp.employment_type)

  return (
    <Modal title={emp.name} onClose={onClose} footer={
      delConfirm
        ? <>
            <span className="text-xs text-red-400 flex-1 flex items-center">Remove {emp.name}?</span>
            <button onClick={() => setDelConfirm(false)} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
            <button onClick={handleDelete} disabled={deleting}
              className="px-4 py-1.5 text-xs rounded-lg bg-red-600/20 border border-red-700/40 text-red-400 hover:bg-red-600/30 flex items-center gap-1">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Remove'}
            </button>
          </>
        : <>
            <button onClick={() => setDelConfirm(true)} className="btn-secondary flex items-center gap-1.5 text-xs px-3">
              <Trash2 className="w-3.5 h-3.5 text-red-400" /> Remove
            </button>
            {!emp.user_id ? (
              <button onClick={() => setShowInvite(true)} className="btn-ghost flex items-center gap-1.5 text-xs px-3 border-primary-700/50 text-primary-400 hover:bg-primary-500/10">
                <UserPlus className="w-3.5 h-3.5" /> Invite & Link Login
              </button>
            ) : (
              <button onClick={() => setShowLinkModal(true)} className="btn-ghost flex items-center gap-1.5 text-xs px-3 border-cyan-700/50 text-cyan-400 hover:bg-cyan-500/10">
                <Link className="w-3.5 h-3.5" /> Set Password
              </button>
            )}
            <button onClick={onEdit} className="flex-1 btn-primary text-sm flex items-center justify-center gap-1.5">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          </>
    }>
      {showInvite && (
        <InviteAndLinkModal
          emp={emp} companyId={companyId}
          onClose={() => setShowInvite(false)}
          onDone={() => {
            setShowInvite(false)
            qc.invalidateQueries(['hr_employees', companyId])
            onClose()
          }}
        />
      )}
      {showLinkModal && (
        <SetPasswordModal emp={emp} onClose={() => setShowLinkModal(false)} />
      )}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary-900/40 border border-primary-700/40 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-primary-400">{emp.name[0]}</span>
        </div>
        <div>
          <p className="font-bold text-slate-100">{emp.name}</p>
          <p className="text-xs text-slate-400">{emp.employee_number} · {emp.designation || 'No designation'}</p>
          <p className="text-xs text-slate-500">{emp.department}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className={`text-xs px-2 py-1 rounded-full border ${emp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40' : 'bg-dark-700 text-slate-500 border-dark-600'}`}>{emp.status}</span>
        <span className="text-xs px-2 py-1 rounded-full border border-dark-600 bg-dark-700 text-slate-400">{typeInfo?.icon} {typeInfo?.label}</span>
        {emp.pf_applicable       && <span className="text-xs bg-blue-900/20 border border-blue-700/30 text-blue-400 px-2 py-0.5 rounded-full">PF</span>}
        {emp.esi_applicable      && <span className="text-xs bg-blue-900/20 border border-blue-700/30 text-blue-400 px-2 py-0.5 rounded-full">ESI</span>}
        {emp.pt_applicable       && <span className="text-xs bg-blue-900/20 border border-blue-700/30 text-blue-400 px-2 py-0.5 rounded-full">PT</span>}
        {emp.bonus_applicable    && <span className="text-xs bg-emerald-900/20 border border-emerald-700/30 text-emerald-400 px-2 py-0.5 rounded-full">Bonus</span>}
        {emp.gratuity_applicable && <span className="text-xs bg-purple-900/20 border border-purple-700/30 text-purple-400 px-2 py-0.5 rounded-full">Gratuity</span>}
        {emp.user_id ? (
          <span className="text-xs bg-primary-900/20 border border-primary-700/30 text-primary-400 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Login Linked
          </span>
        ) : (
          <span className="text-xs bg-dark-700 border border-dark-600 text-slate-500 px-2 py-0.5 rounded-full">No Login</span>
        )}
      </div>

      {/* Service & Compliance info */}
      {emp.joining_date && (() => {
        const yrs = yearsOfService(emp.joining_date)
        const completedYrs = Math.floor(yrs)
        return (
          <div className="bg-dark-700 rounded-xl px-3 py-2.5 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Years of Service</span>
              <span className="text-slate-200 font-medium">{completedYrs} yr{completedYrs !== 1 ? 's' : ''} {Math.round((yrs % 1) * 12)} mo</span>
            </div>
            {emp.gratuity_applicable && yrs >= 5 && salary && (
              <div className="flex justify-between border-t border-dark-600 pt-1">
                <span className="text-purple-400">Gratuity Liability</span>
                <span className="text-purple-300 font-semibold">₹{calcGratuity(emp.joining_date, salary?.basic_salary || 0)?.toLocaleString('en-IN')}</span>
              </div>
            )}
            {emp.gratuity_applicable && yrs < 5 && (
              <div className="flex justify-between text-slate-500">
                <span>Gratuity eligible in</span>
                <span>{Math.ceil(5 - yrs)} yr(s)</span>
              </div>
            )}
            {emp.bocw_number && (
              <div className="flex justify-between border-t border-dark-600 pt-1">
                <span className="text-slate-400">BOCW No.</span>
                <span className="text-slate-200">{emp.bocw_number}</span>
              </div>
            )}
            {emp.min_wage_category && (
              <div className="flex justify-between">
                <span className="text-slate-400">Wage Category</span>
                <span className="text-slate-200 capitalize">{emp.min_wage_category.replace('_', ' ')}</span>
              </div>
            )}
          </div>
        )
      })()}

      {[
        { label: 'Phone',        value: emp.phone },
        { label: 'Email',        value: emp.email },
        { label: 'Joining Date', value: emp.joining_date ? format(parseISO(emp.joining_date), 'dd MMM yyyy') : null },
        { label: 'Address',      value: emp.address },
        { label: 'UAN',          value: emp.uan_number },
        { label: 'Bank',         value: emp.bank_name && emp.bank_account ? `${emp.bank_name} — ${emp.bank_account}` : null },
      ].filter(r => r.value).map(r => (
        <div key={r.label} className="flex justify-between text-xs">
          <span className="text-slate-500 shrink-0 mr-4">{r.label}</span>
          <span className="text-slate-200 text-right break-words">{r.value}</span>
        </div>
      ))}

      {salary && (<>
        <div className="h-px bg-dark-600" />
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Salary</p>
        {emp.employment_type === 'monthly' && (
          <div className="bg-dark-700 rounded-lg p-3 text-xs space-y-1.5">
            {salary.basic_salary > 0 && <div className="flex justify-between"><span className="text-slate-400">Basic</span><span>₹{Number(salary.basic_salary).toLocaleString('en-IN')}</span></div>}
            {salary.hra > 0 && <div className="flex justify-between"><span className="text-slate-400">HRA</span><span>₹{Number(salary.hra).toLocaleString('en-IN')}</span></div>}
            {salary.special_allowance > 0 && <div className="flex justify-between"><span className="text-slate-400">Special Allowance</span><span>₹{Number(salary.special_allowance).toLocaleString('en-IN')}</span></div>}
            {salary.other_allowance > 0 && <div className="flex justify-between"><span className="text-slate-400">Other</span><span>₹{Number(salary.other_allowance).toLocaleString('en-IN')}</span></div>}
            <div className="flex justify-between font-semibold border-t border-dark-600 pt-1">
              <span className="text-slate-300">Gross</span>
              <span className="text-primary-400">₹{(Number(salary.basic_salary) + Number(salary.hra) + Number(salary.special_allowance) + Number(salary.other_allowance)).toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
        {emp.employment_type === 'daily' && Number(salary.daily_rate) > 0 && (
          <div className="bg-dark-700 rounded-lg px-3 py-2 text-xs flex justify-between">
            <span className="text-slate-400">Daily Rate</span>
            <span className="text-primary-400 font-semibold">₹{Number(salary.daily_rate).toLocaleString('en-IN')}/day</span>
          </div>
        )}
        {emp.employment_type === 'shift' && (
          <div className="bg-dark-700 rounded-lg p-3 text-xs space-y-1">
            {Number(salary.day_shift_rate) > 0   && <div className="flex justify-between"><span className="text-slate-400">Day Shift</span><span>₹{Number(salary.day_shift_rate).toLocaleString('en-IN')}</span></div>}
            {Number(salary.night_shift_rate) > 0 && <div className="flex justify-between"><span className="text-slate-400">Night Shift</span><span>₹{Number(salary.night_shift_rate).toLocaleString('en-IN')}</span></div>}
            {Number(salary.double_shift_rate) > 0 && <div className="flex justify-between"><span className="text-slate-400">Double Shift</span><span>₹{Number(salary.double_shift_rate).toLocaleString('en-IN')}</span></div>}
          </div>
        )}
      </>)}

      {/* Attendance Calendar */}
      <div className="h-px bg-dark-600" />
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Attendance</p>
      <EmployeeAttendanceCalendar empId={emp.id} companyId={companyId} role={role} />
      {['admin','manager'].includes(role) && (
        <p className="text-[10px] text-slate-600 italic">Tap a day to edit its attendance record.</p>
      )}
    </Modal>
  )
}

// ── Monthly Calendar (shared) ─────────────────────────────────────────────────
const STATUS_DOT = {
  present:  'bg-emerald-400',
  absent:   'bg-red-400',
  half_day: 'bg-yellow-400',
  leave:    'bg-blue-400',
  week_off: 'bg-slate-500',
  holiday:  'bg-purple-400',
}
const STATUS_CELL = {
  present:  'bg-emerald-500/20 text-emerald-700',
  absent:   'bg-red-500/20 text-red-700',
  half_day: 'bg-yellow-500/20 text-yellow-700',
  leave:    'bg-blue-500/20 text-blue-700',
  week_off: 'bg-slate-200 text-slate-600',
  holiday:  'bg-purple-500/20 text-purple-700',
}
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function MonthlyCalendar({ year, month, dotMap = {}, selectedDate, onDateClick, compact = false }) {
  const firstDay    = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const today       = new Date().toISOString().split('T')[0]

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="grid grid-cols-7 text-center mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <span key={d} className="text-xs text-slate-400 font-semibold">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const ds  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`
          const att = dotMap[ds]
          const isSel    = selectedDate === ds
          const isToday  = ds === today
          const isFuture = ds > today
          return (
            <button key={ds} onClick={() => !isFuture && onDateClick && onDateClick(ds)} disabled={isFuture}
              title={att ? att.status?.replace('_',' ') : ''}
              className={`relative flex flex-col items-center justify-center rounded transition-colors py-1.5
                ${isSel  ? 'bg-primary-600 text-white ring-1 ring-primary-400' : ''}
                ${!isSel && att ? STATUS_CELL[att.status] || 'bg-dark-700 text-slate-400' : ''}
                ${!isSel && !att && isToday ? 'ring-1 ring-primary-500/60 text-slate-200' : ''}
                ${!isSel && !att && !isToday ? 'text-slate-500 hover:bg-dark-700' : ''}
                ${isFuture ? 'opacity-25 cursor-default' : 'cursor-pointer'}`}>
              <span className="text-xs font-semibold">{d}</span>
              {att?.ot_hours > 0 && (
                <span className="text-[9px] text-orange-400 leading-none">OT</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Edit Attendance Modal ─────────────────────────────────────────────────────
function EditAttendanceModal({ record, empName, companyId, onClose, onSaved }) {
  const [status, setStatus] = useState(record?.status || 'present')
  const [startTime, setStart] = useState(record?.shift_start_time || '')
  const [endTime,   setEnd]   = useState(record?.shift_end_time   || '')
  const [saving, setSaving]   = useState(false)

  const hrs    = (startTime && endTime) ? calcShiftHours(startTime, endTime) : 0
  const autoSt = hrs > 0 ? calcShiftStatus(hrs) : null

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      status,
      shift_start_time: startTime || null,
      shift_end_time:   endTime   || null,
      source: 'manual',
    }
    const { error } = await supabase.from('hr_attendance').update(payload).eq('id', record.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Attendance updated')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
          <p className="text-sm font-semibold text-slate-100">Edit Attendance — {empName}</p>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {ATTENDANCE_STATUS.map(s => (
                <button key={s.value} onClick={() => setStatus(s.value)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                    ${status === s.value ? s.cls : 'border-dark-600 bg-dark-700 text-slate-500 hover:border-dark-500'}`}>
                  {s.full}
                </button>
              ))}
            </div>
          </div>
          {(status === 'present' || status === 'half_day') && (
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">Start Time</p>
                <input type="time" value={startTime} onChange={e => setStart(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">End Time</p>
                <input type="time" value={endTime} onChange={e => setEnd(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500" />
              </div>
            </div>
          )}
          {hrs > 0 && (
            <p className="text-xs text-slate-500">Duration: {hrs}h → {autoSt === 'half_day' ? 'Half Day' : 'Full Day'}</p>
          )}
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onClose} className="flex-1 btn-secondary text-xs">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 btn-primary text-xs flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Employee Attendance Calendar (inside employee detail) ─────────────────────
function EmployeeAttendanceCalendar({ empId, companyId, role }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [editRec, setEditRec] = useState(null)
  const qc = useQueryClient()

  const startDate = `${year}-${String(month).padStart(2,'0')}-01`
  const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(new Date(year, month, 0).getDate()).padStart(2,'0')}`

  const { data: records = [], refetch } = useQuery({
    queryKey: ['emp_att_cal', empId, year, month],
    queryFn: async () => {
      const { data } = await supabase.from('hr_attendance').select('*')
        .eq('employee_id', empId).gte('attendance_date', startDate).lte('attendance_date', endDate)
      return data || []
    },
    enabled: !!empId,
  })

  const dotMap = useMemo(() => {
    const m = {}
    records.forEach(r => { m[r.attendance_date] = r })
    return m
  }, [records])

  const counts = useMemo(() => {
    const s = { present: 0, absent: 0, half_day: 0, leave: 0 }
    records.forEach(r => { if (s[r.status] !== undefined) s[r.status]++ })
    return s
  }, [records])

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }
  const canNext = !(year === now.getFullYear() && month === now.getMonth() + 1)

  return (
    <div className="space-y-3">
      {/* Month navigator */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1 text-slate-400 hover:text-slate-200"><ChevronLeft className="w-4 h-4" /></button>
        <p className="text-xs font-semibold text-slate-300">{MONTH_NAMES[month-1]} {year}</p>
        <button onClick={nextMonth} disabled={!canNext} className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <MonthlyCalendar year={year} month={month} dotMap={dotMap}
        onDateClick={ds => {
          const rec = dotMap[ds]
          if (rec && ['admin','manager'].includes(role)) setEditRec(rec)
        }}
        compact />

      {/* Summary pills */}
      <div className="flex gap-2 flex-wrap text-xs">
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-700/30">{counts.present}P</span>
        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-700/30">{counts.absent}A</span>
        <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-700/30">{counts.half_day}H</span>
        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-700/30">{counts.leave}L</span>
      </div>

      {editRec && (
        <EditAttendanceModal record={editRec} empName="" companyId={companyId}
          onClose={() => setEditRec(null)}
          onSaved={() => { refetch(); qc.invalidateQueries(['hr_attendance', companyId]) }} />
      )}
    </div>
  )
}

// ── Employees Tab ─────────────────────────────────────────────────────────────
function EmployeesTab({ companyId }) {
  const [showAdd, setShowAdd]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing]   = useState(null)
  const [search, setSearch]     = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterDept, setFilterDept] = useState('all')

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr_employees', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('hr_employees').select('*')
        .eq('company_id', companyId).order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!companyId,
  })

  const filtered = employees.filter(e =>
    (filterType === 'all' || e.employment_type === filterType) &&
    (filterDept === 'all' || e.department === filterDept) &&
    (!search || e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.employee_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.designation || '').toLowerCase().includes(search.toLowerCase()))
  )

  const depts = [...new Set(employees.map(e => e.department).filter(Boolean))]

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input className="w-full bg-dark-700 border border-dark-600 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500 placeholder-slate-500"
              placeholder="Search employees…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="bg-dark-700 border border-dark-600 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none"
            value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {EMP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {depts.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button onClick={() => setFilterDept('all')}
              className={`shrink-0 text-xs px-3 py-1 rounded-full border transition-colors
                ${filterDept === 'all' ? 'border-primary-500 bg-primary-500/10 text-primary-400' : 'border-dark-600 text-slate-500'}`}>
              All Depts
            </button>
            {depts.map(d => (
              <button key={d} onClick={() => setFilterDept(filterDept === d ? 'all' : d)}
                className={`shrink-0 text-xs px-3 py-1 rounded-full border transition-colors
                  ${filterDept === d ? 'border-primary-500 bg-primary-500/10 text-primary-400' : 'border-dark-600 text-slate-500'}`}>
                {d}
              </button>
            ))}
          </div>
        )}
        {employees.length > 0 && (
          <div className="flex gap-2 text-xs text-slate-500 flex-wrap">
            <span>{employees.filter(e => e.status === 'active').length} active</span>
            {EMP_TYPES.map(t => (
              <span key={t.value}>· {employees.filter(e => e.employment_type === t.value).length} {t.label.toLowerCase()}</span>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Users className="w-12 h-12 text-slate-600" />
            <p className="text-slate-400">{employees.length === 0 ? 'No employees added yet' : 'No match'}</p>
            {employees.length === 0 && (
              <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add First Employee</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(emp => <EmployeeCard key={emp.id} emp={emp} onClick={() => setSelected(emp)} />)}
          </div>
        )}
      </div>

      {showAdd && <EmployeeFormModal companyId={companyId} onClose={() => setShowAdd(false)} />}
      {selected && !editing && (
        <EmployeeDetailModal emp={selected} companyId={companyId}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null) }} />
      )}
      {editing && <EmployeeFormModal companyId={companyId} initialValues={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ── Attendance Tab ────────────────────────────────────────────────────────────
function AttendanceTab({ companyId }) {
  const { role } = useAuth()
  const qc = useQueryClient()
  const _now = new Date()
  const [year,        setYear]        = useState(_now.getFullYear())
  const [month,       setMonth]       = useState(_now.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState(_now.getDate())
  const [saving, setSaving]           = useState(false)
  const [shiftTimes, setShiftTimes]   = useState({})
  const [editOt, setEditOt]           = useState(false)
  const [otInput, setOtInput]         = useState('')
  const [editRec, setEditRec]         = useState(null) // { record, empName }

  // Derived date string
  const date = `${year}-${String(month).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart  = `${year}-${String(month).padStart(2,'0')}-01`
  const monthEnd    = `${year}-${String(month).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }
  const goToday = () => {
    const n = new Date()
    setYear(n.getFullYear()); setMonth(n.getMonth() + 1); setSelectedDay(n.getDate())
  }

  // Fetch company OT threshold (editable by admin/manager)
  const { data: company, refetch: refetchCompany } = useQuery({
    queryKey: ['company_ot', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('companies').select('ot_threshold_hours').eq('id', companyId).single()
      return data
    },
    enabled: !!companyId,
  })
  const otThreshold = company?.ot_threshold_hours ?? 12

  const saveOtThreshold = async () => {
    const v = parseFloat(otInput)
    if (isNaN(v) || v < 1 || v > 24) { toast.error('Enter a valid hour (1–24)'); return }
    await supabase.from('companies').update({ ot_threshold_hours: v }).eq('id', companyId)
    refetchCompany()
    setEditOt(false)
    toast.success(`OT threshold updated to ${v}h`)
  }

  const { data: employees = [] } = useQuery({
    queryKey: ['hr_employees_active', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees')
        .select('id, name, designation, employment_type, employee_number')
        .eq('company_id', companyId).eq('status', 'active').order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: attendance = [], refetch } = useQuery({
    queryKey: ['hr_attendance', companyId, date],
    queryFn: async () => {
      const { data } = await supabase.from('hr_attendance').select('*')
        .eq('company_id', companyId).eq('attendance_date', date)
      return data || []
    },
    enabled: !!companyId,
  })

  // Fetch entire month's attendance to power the calendar dots
  const { data: monthAttendance = [], refetch: refetchMonth } = useQuery({
    queryKey: ['hr_attendance_month', companyId, year, month],
    queryFn: async () => {
      const { data } = await supabase.from('hr_attendance').select('*')
        .eq('company_id', companyId).gte('attendance_date', monthStart).lte('attendance_date', monthEnd)
      return data || []
    },
    enabled: !!companyId,
  })

  // Build a date→first-record map for calendar coloring (keyed by 'YYYY-MM-DD')
  const monthDotMap = useMemo(() => {
    const m = {}
    monthAttendance.forEach(a => {
      if (!m[a.attendance_date]) m[a.attendance_date] = a
    })
    return m
  }, [monthAttendance])

  useEffect(() => {
    const times = {}
    attendance.forEach(a => {
      if (a.shift_start_time || a.shift_end_time) {
        times[a.employee_id] = { start: a.shift_start_time || '', end: a.shift_end_time || '' }
      }
    })
    setShiftTimes(prev => ({ ...prev, ...times }))
  }, [attendance])

  const attMap = useMemo(() => {
    const m = {}
    attendance.forEach(a => { m[a.employee_id] = a })
    return m
  }, [attendance])

  const setShiftTime = (empId, field, value) =>
    setShiftTimes(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }))

  // Core upsert — manual overrides always win; source='manual'
  const markAttendance = async (empId, status, extraFields = {}) => {
    const existing = attMap[empId]
    const payload  = { status, shift_start_time: null, shift_end_time: null, ot_hours: 0, source: 'manual', ...extraFields }
    if (existing) {
      await supabase.from('hr_attendance').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('hr_attendance').insert({
        company_id: companyId, employee_id: empId, attendance_date: date, ...payload,
      })
    }
    refetch()
    refetchMonth()
  }

  // Manual shift time entry in HR tab
  const saveShiftAttendance = async (emp) => {
    const st = shiftTimes[emp.id] || {}
    if (!st.start) { toast.error('Enter shift start time'); return }
    if (!st.end)   { toast.error('Enter shift end time');   return }
    const hours   = calcShiftHours(st.start, st.end)
    const status  = calcShiftStatus(hours)
    if (!status)  { toast.error('Duration is 0 — check times'); return }
    const otHours = calcOtHours(hours, otThreshold)
    await markAttendance(emp.id, status, {
      shift_start_time: st.start,
      shift_end_time:   st.end,
      ot_hours:         otHours,
    })
    const label = status === 'half_day'
      ? `Half Day (${hours}h)`
      : otHours > 0 ? `Present + ${otHours}h OT` : `Present (${hours}h)`
    toast.success(`${emp.name} — ${label}`)
  }

  // Bulk mark — skips shift workers (they must use clock-in/out)
  const markAll = async (status) => {
    setSaving(true)
    for (const emp of employees) {
      if (isShiftWorker(emp)) continue
      const existing = attMap[emp.id]
      if (existing) {
        await supabase.from('hr_attendance').update({ status, shift_start_time: null, shift_end_time: null }).eq('id', existing.id)
      } else {
        await supabase.from('hr_attendance').insert({
          company_id: companyId, employee_id: emp.id, attendance_date: date, status,
        })
      }
    }
    refetch()
    refetchMonth()
    setSaving(false)
    toast.success(`Non-shift employees marked ${status}`)
  }

  const summary = useMemo(() => {
    const s = { present: 0, absent: 0, half_day: 0, leave: 0, week_off: 0, holiday: 0, unmarked: 0 }
    employees.forEach(e => {
      const a = attMap[e.id]
      if (!a) s.unmarked++
      else s[a.status] = (s[a.status] || 0) + 1
    })
    return s
  }, [employees, attMap])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 space-y-2">

        {/* Month navigator */}
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="flex-1 text-center text-sm font-semibold text-slate-100">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="text-xs text-primary-400 hover:text-primary-300 ml-1 px-2 py-1 rounded-lg hover:bg-dark-700">
            Today
          </button>
        </div>

        {/* Monthly calendar — click a date to view/edit that day's attendance */}
        <MonthlyCalendar
          year={year} month={month}
          dotMap={monthDotMap}
          selectedDate={date}
          onDateClick={d => setSelectedDay(parseInt(d.split('-')[2], 10))}
          compact={true}
        />

        {/* Selected day header + bulk actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-dark-700">
          <span className="text-xs font-semibold text-slate-300">
            {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => markAll('present')} disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30">
              All Present
            </button>
            <button onClick={() => markAll('week_off')} disabled={saving}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 hover:border-dark-500">
              All Week Off
            </button>
          </div>
        </div>

        {/* Summary pills */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 text-xs">
          {[
            { label: `${summary.present} Present`,   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-700/40' },
            { label: `${summary.absent} Absent`,     cls: 'text-red-400 bg-red-500/10 border-red-700/40' },
            { label: `${summary.half_day} Half Day`, cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-700/40' },
            { label: `${summary.leave} Leave`,       cls: 'text-blue-400 bg-blue-500/10 border-blue-700/40' },
            summary.unmarked > 0 && { label: `${summary.unmarked} Unmarked`, cls: 'text-slate-400 border-slate-600 bg-dark-700' },
          ].filter(Boolean).map(c => (
            <span key={c.label} className={`shrink-0 px-2.5 py-1 rounded-full border font-medium ${c.cls}`}>{c.label}</span>
          ))}
        </div>

        {/* OT threshold setting */}
        <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-dark-700 pt-2">
          <span className="text-slate-500">OT after</span>
          {editOt ? (
            <>
              <input type="number" min="1" max="24" step="0.5"
                className="w-14 bg-dark-700 border border-primary-500 rounded px-2 py-0.5 text-slate-100 text-xs focus:outline-none"
                value={otInput}
                onChange={e => setOtInput(e.target.value)}
                autoFocus />
              <span className="text-slate-500">hrs</span>
              <button onClick={saveOtThreshold} className="text-primary-400 hover:text-primary-300">Save</button>
              <button onClick={() => setEditOt(false)} className="text-slate-500 hover:text-slate-300">Cancel</button>
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-200">{otThreshold}h</span>
              {['admin','manager'].includes(role) && (
                <button onClick={() => { setOtInput(String(otThreshold)); setEditOt(true) }}
                  className="text-primary-400/60 hover:text-primary-300 underline underline-offset-2">Edit</button>
              )}
            </>
          )}
          <span className="ml-1 text-slate-600">· Auto-filled from shift on operators/supervisors</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Users className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No active employees</p>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {employees.map(emp => {
              const att      = attMap[emp.id]
              const status   = att?.status || null
              const isShift  = isShiftWorker(emp)
              const st       = shiftTimes[emp.id] || {}
              const shiftHrs   = (st.start && st.end) ? calcShiftHours(st.start, st.end) : 0
              const autoStatus = (st.start && st.end) ? calcShiftStatus(shiftHrs) : null
              const autoOT     = calcOtHours(shiftHrs, otThreshold)
              const isAutoFill = att?.source === 'shift_auto'

              return (
                <div key={emp.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                  {/* Employee header */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{emp.name}</p>
                      <p className="text-xs text-slate-500">
                        {emp.employee_number}
                        {emp.designation ? ` · ${emp.designation}` : ''}
                        {isShift && <span className="ml-1.5 text-orange-400/60">· shift</span>}
                        {isAutoFill && <span className="ml-1.5 text-sky-400/60">· auto from shift</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                          ${ATTENDANCE_STATUS.find(s => s.value === status)?.cls || 'border-dark-600 text-slate-400'}`}>
                          {ATTENDANCE_STATUS.find(s => s.value === status)?.full}
                          {att?.ot_hours > 0 && <span className="ml-1 text-orange-400">+{att.ot_hours}h OT</span>}
                        </span>
                      )}
                      {['admin','manager'].includes(role) && att && (
                        <button
                          onClick={() => setEditRec({ record: att, empName: emp.name })}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-dark-700"
                          title="Edit attendance">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isShift ? (
                    /* ── Shift worker: clock in / clock out ── */
                    <div className="space-y-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">Start Time</p>
                          <input type="time"
                            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                            value={st.start || ''}
                            onChange={e => setShiftTime(emp.id, 'start', e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">End Time</p>
                          <input type="time"
                            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                            value={st.end || ''}
                            onChange={e => setShiftTime(emp.id, 'end', e.target.value)} />
                        </div>
                        <button onClick={() => saveShiftAttendance(emp)}
                          className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-primary-600/20 border border-primary-700/40 text-primary-400 hover:bg-primary-600/30">
                          Save
                        </button>
                      </div>

                      {/* Live duration & auto-status preview */}
                      {st.start && st.end ? (
                        <div className={`text-xs flex items-center gap-2 px-2.5 py-1.5 rounded-lg border
                          ${autoStatus === 'half_day'
                            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-700/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-700/30'}`}>
                          <span>{autoStatus === 'half_day' ? '⚡' : '✅'}</span>
                          <span>
                            {shiftHrs}h —{' '}
                            {autoStatus === 'half_day'
                              ? 'Half Day (below 4 hrs)'
                              : autoOT > 0
                                ? `Full Day + ${autoOT}h OT`
                                : 'Full Day'}
                          </span>
                        </div>
                      ) : (
                        !status && <p className="text-xs text-slate-500 italic px-1">Enter start & end time to log attendance</p>
                      )}

                      {/* Override for absent / leave / week_off / holiday */}
                      <div className="flex gap-1.5 flex-wrap">
                        {['absent', 'leave', 'week_off', 'holiday'].map(sv => {
                          const s = ATTENDANCE_STATUS.find(s => s.value === sv)
                          return (
                            <button key={sv}
                              onClick={() => markAttendance(emp.id, sv)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all
                                ${status === sv ? s.cls : 'border-dark-600 bg-dark-700 text-slate-500 hover:border-dark-500'}`}>
                              {s.full}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    /* ── Non-shift: manual status buttons ── */
                    <div className="flex gap-1.5 flex-wrap">
                      {ATTENDANCE_STATUS.map(s => (
                        <button key={s.value} onClick={() => markAttendance(emp.id, s.value)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all
                            ${status === s.value ? s.cls : 'border-dark-600 bg-dark-700 text-slate-500 hover:border-dark-500'}`}>
                          {s.full}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editRec && (
        <EditAttendanceModal
          record={editRec.record}
          empName={editRec.empName}
          companyId={companyId}
          onClose={() => setEditRec(null)}
          onSaved={() => {
            setEditRec(null)
            refetch()
            refetchMonth()
          }}
        />
      )}
    </div>
  )
}

// ── Payslip Modal ─────────────────────────────────────────────────────────────
function PayslipModal({ item, month, year, onClose }) {
  const emp    = item.hr_employees
  const basic  = Number(item.basic_earned || 0)
  const hra    = Number(item.hra_earned || 0)
  const allow  = Number(item.allowances_earned || 0)
  const ot     = Number(item.ot_amount || 0)
  const gross  = Number(item.gross_pay || 0)
  const pfEmp  = Number(item.pf_employee || 0)
  const esiEmp = Number(item.esi_employee || 0)
  const pt     = Number(item.professional_tax || 0)
  const totDed = Number(item.total_deductions || 0)
  const net    = Number(item.net_pay || 0)
  const pfEr   = Number(item.pf_employer || 0)
  const esiEr  = Number(item.esi_employer || 0)

  // Employer PF breakdown: EPS (8.33% capped ₹1,250) + EPF (3.67%) + EDLI (0.5%)
  const eps  = Math.min(Math.round(basic * 0.0833), 1250)
  const edli = Math.round(basic * 0.005)
  const epf  = Math.max(0, pfEr - eps - edli)
  const fmt  = n => Number(n || 0).toLocaleString('en-IN')

  return (
    <Modal title="Payslip" onClose={onClose}>
      <div className="bg-dark-700 rounded-xl px-3 py-2.5">
        <p className="font-bold text-slate-100">{emp?.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{emp?.employee_number} · {emp?.designation || '—'}</p>
        <p className="text-xs text-slate-500">{MONTH_NAMES[month - 1]} {year}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-center">
        {[
          { label: 'Present', val: item.days_present, cls: 'text-emerald-400' },
          { label: 'Absent',  val: item.days_absent,  cls: 'text-red-400'     },
          { label: 'Leave',   val: item.days_leave,   cls: 'text-blue-400'    },
        ].map(c => (
          <div key={c.label} className="bg-dark-700 rounded-xl py-2.5">
            <p className="text-slate-400 mb-0.5">{c.label}</p>
            <p className={`font-bold text-base ${c.cls}`}>{c.val}</p>
          </div>
        ))}
      </div>

      <SectionHeader label="Earnings" />
      <div className="space-y-1.5 text-xs">
        {basic > 0 && <div className="flex justify-between"><span className="text-slate-400">Basic / Wage</span><span className="text-slate-200">₹{fmt(basic)}</span></div>}
        {hra   > 0 && <div className="flex justify-between"><span className="text-slate-400">HRA</span><span className="text-slate-200">₹{fmt(hra)}</span></div>}
        {allow > 0 && <div className="flex justify-between"><span className="text-slate-400">Allowances</span><span className="text-slate-200">₹{fmt(allow)}</span></div>}
        {ot    > 0 && (
          <div className="flex justify-between">
            <span className="text-orange-400">Overtime ({Number(item.ot_hours || 0)} hrs)</span>
            <span className="text-orange-300">₹{fmt(ot)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t border-dark-600 pt-1.5">
          <span className="text-slate-300">Gross Pay</span>
          <span className="text-primary-400">₹{fmt(gross)}</span>
        </div>
      </div>

      <SectionHeader label="Deductions (Employee)" />
      <div className="space-y-1.5 text-xs">
        {pfEmp  > 0 && <div className="flex justify-between"><span className="text-slate-400">Provident Fund — EPF (12%)</span><span className="text-red-400">−₹{fmt(pfEmp)}</span></div>}
        {esiEmp > 0 && <div className="flex justify-between"><span className="text-slate-400">ESI (0.75% of gross)</span><span className="text-red-400">−₹{fmt(esiEmp)}</span></div>}
        {pt     > 0 && <div className="flex justify-between"><span className="text-slate-400">Professional Tax</span><span className="text-red-400">−₹{fmt(pt)}</span></div>}
        {totDed === 0
          ? <p className="text-slate-500 italic">No statutory deductions applicable</p>
          : <div className="flex justify-between font-semibold border-t border-dark-600 pt-1.5">
              <span className="text-slate-300">Total Deductions</span>
              <span className="text-red-400">−₹{fmt(totDed)}</span>
            </div>}
      </div>

      <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Net Take-Home Pay</p>
          <p className="text-[10px] text-slate-500">After all deductions</p>
        </div>
        <p className="font-bold text-emerald-400 text-xl">₹{fmt(net)}</p>
      </div>

      {(pfEr > 0 || esiEr > 0) && (<>
        <SectionHeader label="Employer Contributions (not deducted from salary)" />
        <div className="bg-dark-700 border border-dark-600 rounded-xl p-3 space-y-1.5 text-xs">
          {pfEr > 0 && (<>
            <div className="flex justify-between"><span className="text-slate-400">EPF Employer (3.67% of basic)</span><span className="text-slate-200">₹{fmt(epf)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">EPS — Pension (8.33%, cap ₹1,250)</span><span className="text-slate-200">₹{fmt(eps)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">EDLI — Insurance (0.5%)</span><span className="text-slate-200">₹{fmt(edli)}</span></div>
          </>)}
          {esiEr > 0 && <div className="flex justify-between"><span className="text-slate-400">ESI Employer (3.25% of gross)</span><span className="text-slate-200">₹{fmt(esiEr)}</span></div>}
          <div className="flex justify-between font-semibold border-t border-dark-600 pt-1.5">
            <span className="text-slate-300">Total Cost to Company</span>
            <span className="text-purple-400">₹{fmt(gross + pfEr + esiEr)}</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Employer PF/ESI contributions are remitted separately to EPFO/ESIC — not deducted from employee salary.
        </p>
      </>)}

      <div className="flex items-center justify-between text-xs pt-1">
        <span className="text-slate-400">Payment Status</span>
        <span className={`px-2.5 py-1 rounded-full border font-medium
          ${item.payment_status === 'paid'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40'
            : 'bg-yellow-500/10 text-yellow-400 border-yellow-700/40'}`}>
          {item.payment_status === 'paid'
            ? `✓ Paid${item.payment_date ? ` on ${format(parseISO(item.payment_date), 'dd MMM yyyy')}` : ''}`
            : 'Pending'}
        </span>
      </div>
    </Modal>
  )
}

// ── Payroll Tab ────────────────────────────────────────────────────────────────
function PayrollTab({ companyId }) {
  const qc = useQueryClient()
  const now = new Date()
  const [month, setMonth]           = useState(now.getMonth() + 1)
  const [year,  setYear]            = useState(now.getFullYear())
  const [processing, setProcessing] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [payslipItem, setPayslipItem] = useState(null)

  const { data: payroll } = useQuery({
    queryKey: ['hr_payroll', companyId, month, year],
    queryFn: async () => {
      const { data } = await supabase.from('hr_payroll').select('*')
        .eq('company_id', companyId).eq('month', month).eq('year', year).maybeSingle()
      return data
    },
    enabled: !!companyId,
  })

  const { data: payrollItems = [] } = useQuery({
    queryKey: ['hr_payroll_items', payroll?.id],
    queryFn: async () => {
      const { data } = await supabase.from('hr_payroll_items')
        .select('*, hr_employees(name, designation, employment_type, employee_number)')
        .eq('payroll_id', payroll.id).order('created_at')
      return data || []
    },
    enabled: !!payroll?.id,
  })

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const processPayroll = async () => {
    setProcessing(true)
    try {
      const daysInMonth = getDaysInMonth(new Date(year, month - 1))
      const { data: employees } = await supabase.from('hr_employees').select('*')
        .eq('company_id', companyId).eq('status', 'active')
      if (!employees?.length) { toast.error('No active employees found'); setProcessing(false); return }

      let payrollId = payroll?.id
      if (!payrollId) {
        const { data: pr, error } = await supabase.from('hr_payroll').insert({
          company_id: companyId, month, year, status: 'draft',
          processed_at: new Date().toISOString(),
        }).select().single()
        if (error) throw error
        payrollId = pr.id
      }

      let totalGross = 0, totalDed = 0, totalNet = 0, totalPfEmp = 0, totalEsiEmp = 0

      for (const emp of employees) {
        const { data: sal } = await supabase.from('hr_salary_structure')
          .select('*').eq('employee_id', emp.id)
          .order('effective_from', { ascending: false }).limit(1).maybeSingle()
        if (!sal) continue

        const startDate = `${year}-${String(month).padStart(2,'0')}-01`
        const endDate   = `${year}-${String(month).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`
        const { data: att } = await supabase.from('hr_attendance').select('*')
          .eq('employee_id', emp.id).gte('attendance_date', startDate).lte('attendance_date', endDate)

        const attArr      = att || []
        const weekOffs    = attArr.filter(a => a.status === 'week_off' || a.status === 'holiday').length
        const workingDays = daysInMonth - weekOffs
        const daysPresent = attArr.filter(a => a.status === 'present').length
          + attArr.filter(a => a.status === 'half_day').length * 0.5
        const daysLeave   = attArr.filter(a => a.status === 'leave').length
        const daysAbsent  = Math.max(0, workingDays - daysPresent - daysLeave)
        const otHours     = attArr.reduce((s, a) => s + Number(a.ot_hours || 0), 0)

        let basicEarned = 0, hraEarned = 0, allowancesEarned = 0

        if (emp.employment_type === 'monthly') {
          const ratio = workingDays > 0 ? daysPresent / workingDays : 1
          basicEarned      = Math.round(Number(sal.basic_salary || 0) * ratio)
          hraEarned        = Math.round(Number(sal.hra || 0) * ratio)
          allowancesEarned = Math.round((Number(sal.special_allowance || 0) + Number(sal.other_allowance || 0)) * ratio)
        } else if (emp.employment_type === 'daily') {
          basicEarned = Math.round(daysPresent * Number(sal.daily_rate || 0))
        } else if (emp.employment_type === 'shift') {
          basicEarned = Math.round(daysPresent * Number(sal.day_shift_rate || 0))
        }

        const otAmount    = Math.round(otHours * Number(sal.ot_rate_per_hour || 0))
        const grossPay    = basicEarned + hraEarned + allowancesEarned + otAmount

        // Employee deductions
        const pfEmployee  = emp.pf_applicable ? Math.round(basicEarned * 0.12) : 0
        const esiEmployee = emp.esi_applicable && grossPay <= 21000 ? Math.round(grossPay * 0.0075) : 0
        const pt          = emp.pt_applicable ? calcPT(grossPay) : 0
        const totalDeductions = pfEmployee + esiEmployee + pt
        const netPay = grossPay - totalDeductions

        // Employer contributions (EPF Act): EPS 8.33% (cap ₹1,250) + EPF 3.67% + EDLI 0.5%
        const epsContrib  = emp.pf_applicable ? Math.min(Math.round(basicEarned * 0.0833), 1250) : 0
        const epfEmployer = emp.pf_applicable ? Math.round(basicEarned * 0.0367) : 0
        const edliContrib = emp.pf_applicable ? Math.round(basicEarned * 0.005) : 0
        const pfEmployer  = epsContrib + epfEmployer + edliContrib
        const esiEmployer = emp.esi_applicable && grossPay <= 21000 ? Math.round(grossPay * 0.0325) : 0

        totalGross += grossPay; totalDed += totalDeductions; totalNet += netPay
        totalPfEmp += pfEmployer; totalEsiEmp += esiEmployer

        await supabase.from('hr_payroll_items').upsert({
          company_id: companyId, payroll_id: payrollId, employee_id: emp.id,
          total_working_days: daysInMonth, days_present: daysPresent,
          days_absent: daysAbsent, days_leave: daysLeave,
          shifts_worked: Math.round(daysPresent), ot_hours: otHours,
          basic_earned: basicEarned, hra_earned: hraEarned,
          allowances_earned: allowancesEarned, ot_amount: otAmount, gross_pay: grossPay,
          pf_employee: pfEmployee, pf_employer: pfEmployer,
          esi_employee: esiEmployee, esi_employer: esiEmployer,
          professional_tax: pt, total_deductions: totalDeductions, net_pay: netPay,
        }, { onConflict: 'payroll_id,employee_id' })
      }

      await supabase.from('hr_payroll').update({
        status: 'processed', total_gross: totalGross, total_deductions: totalDed,
        total_net: totalNet, total_pf_employer: totalPfEmp, total_esi_employer: totalEsiEmp,
        processed_at: new Date().toISOString(),
      }).eq('id', payrollId)

      toast.success('Payroll processed!')
      qc.invalidateQueries(['hr_payroll', companyId, month, year])
      qc.invalidateQueries(['hr_payroll_items', payrollId])
    } catch (err) {
      toast.error(err.message || 'Failed to process payroll')
    } finally { setProcessing(false) }
  }

  const markPaid = async (itemId) => {
    await supabase.from('hr_payroll_items').update({
      payment_status: 'paid', payment_date: new Date().toISOString().split('T')[0],
    }).eq('id', itemId)
    qc.invalidateQueries(['hr_payroll_items', payroll?.id])
    toast.success('Marked as paid')
  }

  const markAllPaid = async () => {
    const unpaid = payrollItems.filter(i => i.payment_status !== 'paid')
    if (!unpaid.length) { toast('All already paid'); return }
    setMarkingAll(true)
    const today = new Date().toISOString().split('T')[0]
    for (const item of unpaid) {
      await supabase.from('hr_payroll_items').update({
        payment_status: 'paid', payment_date: today,
      }).eq('id', item.id)
    }
    qc.invalidateQueries(['hr_payroll_items', payroll?.id])
    toast.success(`${unpaid.length} employee${unpaid.length > 1 ? 's' : ''} marked paid`)
    setMarkingAll(false)
  }

  const totalCost = Number(payroll?.total_gross || 0)
    + Number(payroll?.total_pf_employer || 0)
    + Number(payroll?.total_esi_employer || 0)
  const paidCount   = payrollItems.filter(i => i.payment_status === 'paid').length
  const pendingCount = payrollItems.length - paidCount
  const fmt = n => Number(n || 0).toLocaleString('en-IN')

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 space-y-2">
        {/* Month / Year / Status / Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <select className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
            value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select className="bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none"
            value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium
            ${!payroll ? 'border-dark-600 text-slate-500 bg-dark-700'
              : payroll.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40'
              : payroll.status === 'processed' ? 'bg-blue-500/10 text-blue-400 border-blue-700/40'
              : 'bg-yellow-500/10 text-yellow-400 border-yellow-700/40'}`}>
            {payroll?.status || 'Not processed'}
          </span>
          <div className="ml-auto flex gap-1.5">
            {payroll && pendingCount > 0 && (
              <button onClick={markAllPaid} disabled={markingAll}
                className="text-xs px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30 flex items-center gap-1.5">
                {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Pay All ({pendingCount})
              </button>
            )}
            <button onClick={processPayroll} disabled={processing}
              className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5">
              {processing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing…</>
                : <><BarChart2 className="w-3.5 h-3.5" />{payroll ? 'Re-process' : 'Process Payroll'}</>}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {payroll && (<>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Gross Payable', value: payroll.total_gross,      cls: 'text-primary-400' },
              { label: 'Deductions',    value: payroll.total_deductions, cls: 'text-red-400'     },
              { label: 'Net Pay',       value: payroll.total_net,        cls: 'text-emerald-400' },
            ].map(c => (
              <div key={c.label} className="bg-dark-700 rounded-xl px-3 py-2.5 text-center">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className={`text-sm font-bold ${c.cls}`}>₹{fmt(c.value)}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Employer PF',  value: payroll.total_pf_employer,  cls: 'text-blue-400'   },
              { label: 'Employer ESI', value: payroll.total_esi_employer, cls: 'text-blue-400'   },
              { label: 'Total CTC',    value: totalCost,                  cls: 'text-purple-400' },
            ].map(c => (
              <div key={c.label} className="bg-dark-700 rounded-xl px-3 py-2 text-center">
                <p className="text-[10px] text-slate-400">{c.label}</p>
                <p className={`text-xs font-bold ${c.cls}`}>₹{fmt(c.value)}</p>
              </div>
            ))}
          </div>
          {payrollItems.length > 0 && (
            <p className="text-xs text-slate-500">
              {paidCount} paid · {pendingCount} pending · {payrollItems.length} employees
            </p>
          )}
        </>)}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!payroll ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
            <Banknote className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No payroll for {MONTHS[month-1]} {year}</p>
            <p className="text-xs text-slate-500">Process payroll to auto-calculate from attendance data</p>
          </div>
        ) : payrollItems.length === 0 ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 text-primary-400 animate-spin" /></div>
        ) : (
          <div className="space-y-2">
            {payrollItems.map(item => {
              const emp = item.hr_employees
              const isPaid = item.payment_status === 'paid'
              return (
                <div key={item.id} className={`bg-dark-800 border rounded-xl p-3 transition-all
                  ${isPaid ? 'border-dark-700 opacity-80' : 'border-dark-700 hover:border-dark-600'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-sm truncate">{emp?.name}</p>
                      <p className="text-xs text-slate-500">{emp?.employee_number} · {emp?.designation}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-400 text-sm">₹{fmt(item.net_pay)}</p>
                      <p className="text-[10px] text-slate-500">Take Home</p>
                    </div>
                  </div>

                  {/* Attendance row */}
                  <div className="mt-2 flex gap-3 text-xs text-slate-400 flex-wrap">
                    <span>Present <strong className="text-emerald-400">{item.days_present}</strong></span>
                    <span>Absent <strong className="text-red-400">{item.days_absent}</strong></span>
                    <span>Leave <strong className="text-blue-400">{item.days_leave}</strong></span>
                    {Number(item.ot_hours) > 0 && (
                      <span>OT <strong className="text-orange-400">{item.ot_hours}h</strong></span>
                    )}
                  </div>

                  {/* Earnings / deductions row */}
                  <div className="mt-1.5 flex gap-3 text-xs text-slate-400 flex-wrap">
                    <span>Gross <strong className="text-slate-200">₹{fmt(item.gross_pay)}</strong></span>
                    {Number(item.pf_employee) > 0 && (
                      <span>PF <strong className="text-slate-300">₹{fmt(item.pf_employee)}</strong></span>
                    )}
                    {Number(item.esi_employee) > 0 && (
                      <span>ESI <strong className="text-slate-300">₹{fmt(item.esi_employee)}</strong></span>
                    )}
                    {Number(item.professional_tax) > 0 && (
                      <span>PT <strong className="text-slate-300">₹{fmt(item.professional_tax)}</strong></span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
                      ${isPaid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/40' : 'bg-yellow-500/10 text-yellow-400 border-yellow-700/40'}`}>
                      {isPaid ? '✓ Paid' : 'Pending'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setPayslipItem(item)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-dark-700 border border-dark-600 text-slate-400 hover:text-slate-200 hover:border-dark-500 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Payslip
                      </button>
                      {!isPaid && (
                        <button onClick={() => markPaid(item.id)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Mark Paid
                        </button>
                      )}
                      {isPaid && item.payment_date && (
                        <span className="text-xs text-slate-500">{format(parseISO(item.payment_date), 'dd MMM yyyy')}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {payslipItem && (
        <PayslipModal
          item={payslipItem}
          month={month}
          year={year}
          onClose={() => setPayslipItem(null)}
        />
      )}
    </div>
  )
}

// ── Leaves Tab ────────────────────────────────────────────────────────────────
function LeavesTab({ companyId }) {
  const qc = useQueryClient()
  const { role } = useAuth()
  const isAdmin = ['admin', 'superadmin', 'manager'].includes(role)
  const [showAdd, setShowAdd]         = useState(false)
  const [selectedEmp, setSelectedEmp] = useState('')
  const [leaveForm, setLeaveForm]     = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
  const [saving, setSaving]           = useState(false)

  const { data: employees = [] } = useQuery({
    queryKey: ['hr_employees_active', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_employees').select('id, name, employee_number')
        .eq('company_id', companyId).eq('status', 'active').order('name')
      return data || []
    },
    enabled: !!companyId,
  })

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['hr_leaves', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('hr_leaves')
        .select('*, hr_employees(name, employee_number)')
        .eq('company_id', companyId).order('created_at', { ascending: false }).limit(100)
      return data || []
    },
    enabled: !!companyId,
  })

  const calcDays = (from, to) => {
    if (!from || !to) return 0
    return Math.max(0, Math.ceil((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1)
  }

  const handleApply = async () => {
    if (!selectedEmp)         { toast.error('Select employee'); return }
    if (!leaveForm.from_date) { toast.error('Select from date'); return }
    if (!leaveForm.to_date)   { toast.error('Select to date'); return }
    const days = calcDays(leaveForm.from_date, leaveForm.to_date)
    setSaving(true)
    try {
      const { error } = await supabase.from('hr_leaves').insert({
        company_id: companyId, employee_id: selectedEmp,
        leave_type: leaveForm.leave_type, from_date: leaveForm.from_date,
        to_date: leaveForm.to_date, days, reason: leaveForm.reason || null, status: 'pending',
      })
      if (error) throw error
      toast.success('Leave applied')
      qc.invalidateQueries(['hr_leaves', companyId])
      setShowAdd(false)
      setLeaveForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' })
      setSelectedEmp('')
    } catch (err) { toast.error(err.message || 'Failed') } finally { setSaving(false) }
  }

  const updateStatus = async (id, status) => {
    await supabase.from('hr_leaves').update({ status, approved_at: new Date().toISOString() }).eq('id', id)
    qc.invalidateQueries(['hr_leaves', companyId])
    toast.success(status === 'approved' ? 'Approved' : 'Rejected')
  }

  const statusCls = {
    pending:  'text-yellow-400 bg-yellow-500/10 border-yellow-700/40',
    approved: 'text-emerald-400 bg-emerald-500/10 border-emerald-700/40',
    rejected: 'text-red-400 bg-red-500/10 border-red-700/40',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 shrink-0 flex items-center justify-between">
        <p className="text-xs text-slate-400">{leaves.filter(l => l.status === 'pending').length} pending approval</p>
        <button onClick={() => setShowAdd(v => !v)} className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Apply Leave
        </button>
      </div>

      {showAdd && (
        <div className="mx-4 mb-2 bg-dark-800 border border-dark-600 rounded-xl p-3 space-y-2.5 shrink-0">
          <p className="text-xs font-semibold text-slate-300">New Leave Request</p>
          <Field label="Employee" required>
            <select className={inp()} value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_number})</option>)}
            </select>
          </Field>
          <Field label="Leave Type">
            <select className={inp()} value={leaveForm.leave_type} onChange={e => setLeaveForm(p => ({ ...p, leave_type: e.target.value }))}>
              {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From"><input type="date" className={inp()} value={leaveForm.from_date} onChange={e => setLeaveForm(p => ({ ...p, from_date: e.target.value }))} /></Field>
            <Field label="To"><input type="date" className={inp()} value={leaveForm.to_date} onChange={e => setLeaveForm(p => ({ ...p, to_date: e.target.value }))} /></Field>
          </div>
          {leaveForm.from_date && leaveForm.to_date && (
            <p className="text-xs text-primary-400">{calcDays(leaveForm.from_date, leaveForm.to_date)} day(s)</p>
          )}
          <Field label="Reason">
            <textarea className={inp('resize-none')} rows={2} value={leaveForm.reason}
              onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason…" />
          </Field>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 btn-secondary text-xs">Cancel</button>
            <button onClick={handleApply} disabled={saving} className="flex-1 btn-primary text-xs flex items-center justify-center gap-1">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary-400 animate-spin" /></div>
        ) : leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Calendar className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaves.map(l => {
              const lt = LEAVE_TYPES.find(t => t.value === l.leave_type)
              return (
                <div key={l.id} className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-sm truncate">{l.hr_employees?.name}</p>
                      <p className={`text-xs font-medium ${lt?.color}`}>{lt?.label}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${statusCls[l.status]}`}>{l.status}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-3 flex-wrap">
                    <span>{format(parseISO(l.from_date), 'dd MMM')} → {format(parseISO(l.to_date), 'dd MMM yyyy')}</span>
                    <span className="font-medium text-slate-200">{l.days} day{l.days > 1 ? 's' : ''}</span>
                  </div>
                  {l.reason && <p className="text-xs text-slate-500 mt-1">{l.reason}</p>}
                  {isAdmin && l.status === 'pending' && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => updateStatus(l.id, 'approved')}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-600/30">
                        ✓ Approve
                      </button>
                      <button onClick={() => updateStatus(l.id, 'rejected')}
                        className="flex-1 text-xs py-1.5 rounded-lg bg-red-600/10 border border-red-700/30 text-red-400 hover:bg-red-600/20">
                        ✗ Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main HRPage ───────────────────────────────────────────────────────────────
export default function HRPage() {
  const { companyId } = useAuth()
  const [activeTab, setActiveTab] = useState('employees')
  const [showAdd, setShowAdd] = useState(false)

  const { data: empCount = 0 } = useQuery({
    queryKey: ['hr_emp_count', companyId],
    queryFn: async () => {
      const { count } = await supabase.from('hr_employees').select('*', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'active')
      return count || 0
    },
    enabled: !!companyId,
  })

  const tabs = [
    { id: 'employees',  label: 'Employees',  icon: Users },
    { id: 'attendance', label: 'Attendance', icon: CheckCircle },
    { id: 'payroll',    label: 'Payroll',    icon: Banknote },
    { id: 'leaves',     label: 'Leaves',     icon: Calendar },
  ]

  return (
    <div className="flex flex-col h-full bg-dark-900">
      <div className="px-4 pt-4 pb-2 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Employee Management</h1>
          <p className="text-xs text-slate-400">{empCount} active · Attendance · Payroll · Leaves</p>
        </div>
        {activeTab === 'employees' && (
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        )}
      </div>

      <div className="flex border-b border-dark-700 shrink-0 px-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                ${activeTab === t.id ? 'border-primary-500 text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <Icon className="w-3.5 h-3.5" />{t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'employees'  && <EmployeesTab  companyId={companyId} />}
        {activeTab === 'attendance' && <AttendanceTab companyId={companyId} />}
        {activeTab === 'payroll'    && <PayrollTab    companyId={companyId} />}
        {activeTab === 'leaves'     && <LeavesTab     companyId={companyId} />}
      </div>

      {showAdd && <EmployeeFormModal companyId={companyId} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
