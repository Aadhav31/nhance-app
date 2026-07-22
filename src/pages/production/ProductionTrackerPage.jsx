/**
 * ProductionTrackerPage.jsx
 * Crusher / Quarry industry — daily production log
 *
 * Tabs:
 *   Today    — Quick entry form + live daily totals by grade & machine
 *   History  — Past records, filterable by date range & machine
 *   Grades   — Admin-only grade management (add/edit/deactivate)
 */

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Factory, Plus, Loader2, Save, Trash2, Edit2, X,
  ChevronLeft, ChevronRight, BarChart3, Package,
  Layers, Settings, RefreshCw, AlertTriangle,
  Clipboard, Truck, Zap, Fuel,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, subDays, parseISO } from 'date-fns'

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr  = () => format(new Date(), 'yyyy-MM-dd')
const fmtDate   = (d) => d ? format(parseISO(d), 'd MMM yyyy') : '—'
const fmtT      = (n) => n != null ? `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })} T` : '—'
const inp       = 'w-full bg-dark-700 border border-dark-500 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-primary-500'

// ── Grade badge colour by index ───────────────────────────────────────────────
const GRADE_COLORS = [
  'bg-blue-500/15 border-blue-700/30 text-blue-300',
  'bg-green-500/15 border-green-700/30 text-green-300',
  'bg-yellow-500/15 border-yellow-700/30 text-yellow-300',
  'bg-orange-500/15 border-orange-700/30 text-orange-300',
  'bg-purple-500/15 border-purple-700/30 text-purple-300',
  'bg-pink-500/15 border-pink-700/30 text-pink-300',
]
const gradeColor = (i) => GRADE_COLORS[i % GRADE_COLORS.length]

// ── Shared data hooks ─────────────────────────────────────────────────────────
function useGrades(companyId) {
  return useQuery({
    queryKey: ['crusher_grades', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('crusher_grades')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('sort_order')
      return data || []
    },
    enabled: !!companyId,
  })
}

function useMachines(companyId) {
  return useQuery({
    queryKey: ['crusher_machines', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, name, equipment_number')
        .eq('company_id', companyId)
        .in('status', ['active', 'idle'])
        .order('equipment_number')
      return data || []
    },
    enabled: !!companyId,
  })
}

// ── Log Production Modal ───────────────────────────────────────────────────────
function LogProductionModal({ companyId, session, grades, machines, existing, onClose, onSaved }) {
  const isEdit = !!existing
  const initOutputs = () => grades.map(g => ({
    grade_id:   g.id,
    grade_name: g.grade_name,
    quantity:   existing?.outputs?.find(o => o.grade_id === g.id)?.quantity_tonnes?.toString() || '',
  }))

  const [date,     setDate]     = useState(existing?.production_date || todayStr())
  const [shift,    setShift]    = useState(existing?.shift_type || 'day')
  const [machineId,setMachine]  = useState(existing?.equipment_id || '')
  const [rawInput, setRawInput] = useState(existing?.raw_input_tonnes?.toString() || '')
  const [hours,    setHours]    = useState(existing?.running_hours?.toString() || '')
  const [notes,    setNotes]    = useState(existing?.notes || '')
  const [outputs,  setOutputs]  = useState(initOutputs)
  const [saving,   setSaving]   = useState(false)

  const setOutput = (idx, val) => {
    setOutputs(prev => prev.map((o, i) => i === idx ? { ...o, quantity: val } : o))
  }

  const totalOutput = outputs.reduce((s, o) => s + (parseFloat(o.quantity) || 0), 0)

  const handleSave = async () => {
    if (!machineId) return toast.error('Select a machine')
    if (!rawInput || parseFloat(rawInput) <= 0) return toast.error('Enter raw input quantity')
    const hasOutput = outputs.some(o => parseFloat(o.quantity) > 0)
    if (!hasOutput) return toast.error('Enter output for at least one grade')

    setSaving(true)
    try {
      const machine = machines.find(m => m.id === machineId)
      const payload = {
        company_id:       companyId,
        production_date:  date,
        shift_type:       shift,
        equipment_id:     machineId,
        equipment_name:   machine ? `${machine.equipment_number} — ${machine.name}` : null,
        raw_input_tonnes: parseFloat(rawInput),
        running_hours:    hours ? parseFloat(hours) : null,
        notes:            notes || null,
        created_by:       session.user.id,
      }

      let prodId
      if (isEdit) {
        const { error } = await supabase.from('crusher_production').update(payload).eq('id', existing.id)
        if (error) throw error
        prodId = existing.id
        // Delete old outputs then re-insert
        await supabase.from('crusher_production_outputs').delete().eq('production_id', prodId)
      } else {
        const { data, error } = await supabase.from('crusher_production').insert(payload).select('id').single()
        if (error) throw error
        prodId = data.id
      }

      // Insert outputs
      const outputRows = outputs
        .filter(o => parseFloat(o.quantity) > 0)
        .map(o => ({
          production_id:   prodId,
          grade_id:        o.grade_id,
          grade_name:      o.grade_name,
          quantity_tonnes: parseFloat(o.quantity),
        }))
      if (outputRows.length) {
        const { error: oErr } = await supabase.from('crusher_production_outputs').insert(outputRows)
        if (oErr) throw oErr
      }

      toast.success(isEdit ? 'Production updated' : 'Production logged')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <p className="text-sm font-bold text-slate-100">{isEdit ? 'Edit Production Entry' : 'Log Production'}</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          {/* Date + Shift */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Date *</p>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Shift</p>
              <select className={inp} value={shift} onChange={e => setShift(e.target.value)}>
                <option value="day">☀️ Day</option>
                <option value="night">🌙 Night</option>
                <option value="general">🔄 General</option>
              </select>
            </div>
          </div>

          {/* Machine */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Machine *</p>
            <select className={inp} value={machineId} onChange={e => setMachine(e.target.value)}>
              <option value="">Select machine…</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.equipment_number} — {m.name}</option>
              ))}
            </select>
          </div>

          {/* Raw input + Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Raw Input (Tonnes) *</p>
              <input type="number" className={inp} value={rawInput} onChange={e => setRawInput(e.target.value)}
                step="0.001" placeholder="0.000" min="0" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Running Hours</p>
              <input type="number" className={inp} value={hours} onChange={e => setHours(e.target.value)}
                step="0.5" placeholder="0.0" min="0" />
            </div>
          </div>

          {/* Grade Outputs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-300">Output by Grade (Tonnes)</p>
              {totalOutput > 0 && (
                <span className="text-xs text-primary-400 font-mono">Total: {totalOutput.toFixed(3)} T</span>
              )}
            </div>
            {grades.length === 0 ? (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                ⚠️ No grades set up yet. Go to the Grades tab to add your product grades first.
              </div>
            ) : (
              <div className="space-y-2">
                {outputs.map((o, i) => (
                  <div key={o.grade_id} className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg border w-20 text-center flex-shrink-0 ${gradeColor(i)}`}>
                      {o.grade_name}
                    </span>
                    <input
                      type="number"
                      className={`${inp} flex-1`}
                      value={o.quantity}
                      onChange={e => setOutput(i, e.target.value)}
                      step="0.001" placeholder="0.000" min="0"
                    />
                    <span className="text-xs text-slate-600 w-4">T</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Notes</p>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Breakdowns, delays, material quality…" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving || grades.length === 0}
            className="flex-1 btn-primary flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Log Production'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TODAY TAB ─────────────────────────────────────────────────────────────────
function TodayTab({ companyId, session, isAdmin }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [viewDate, setViewDate] = useState(todayStr())

  const { data: grades = [] } = useGrades(companyId)
  const { data: machines = [] } = useMachines(companyId)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['crusher_prod_day', companyId, viewDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('crusher_production')
        .select('*, crusher_production_outputs(*)')
        .eq('company_id', companyId)
        .eq('production_date', viewDate)
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this production entry?')) return
    const { error } = await supabase.from('crusher_production').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Entry deleted')
    qc.invalidateQueries(['crusher_prod_day', companyId, viewDate])
  }

  // Aggregate totals for the day
  const dayTotals = useMemo(() => {
    const totals = { rawInput: 0, totalOutput: 0, grades: {} }
    entries.forEach(e => {
      totals.rawInput += Number(e.raw_input_tonnes) || 0
      e.crusher_production_outputs?.forEach(o => {
        totals.grades[o.grade_name] = (totals.grades[o.grade_name] || 0) + Number(o.quantity_tonnes)
        totals.totalOutput += Number(o.quantity_tonnes)
      })
    })
    return totals
  }, [entries])

  const prevDay = () => setViewDate(format(subDays(parseISO(viewDate), 1), 'yyyy-MM-dd'))
  const nextDay = () => {
    const next = format(new Date(new Date(viewDate).getTime() + 86400000), 'yyyy-MM-dd')
    if (next <= todayStr()) setViewDate(next)
  }

  const onSaved = () => {
    setShowForm(false)
    setEditEntry(null)
    qc.invalidateQueries(['crusher_prod_day', companyId, viewDate])
    qc.invalidateQueries(['crusher_prod_history', companyId])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Date nav + Log button */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-100 min-w-[120px] text-center">
            {viewDate === todayStr() ? 'Today' : fmtDate(viewDate)}
          </span>
          <button onClick={nextDay} disabled={viewDate >= todayStr()}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
          <Plus className="w-4 h-4" /> Log Production
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Day summary cards */}
        {entries.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Raw Input</p>
                <p className="text-xl font-black text-slate-100">{dayTotals.rawInput.toFixed(2)} <span className="text-xs font-normal text-slate-500">T</span></p>
              </div>
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Total Output</p>
                <p className="text-xl font-black text-green-400">{dayTotals.totalOutput.toFixed(2)} <span className="text-xs font-normal text-slate-500">T</span></p>
              </div>
            </div>

            {/* Grade-wise breakdown */}
            {Object.keys(dayTotals.grades).length > 0 && (
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-3">Output by Grade</p>
                <div className="grid grid-cols-2 gap-2">
                  {grades.filter(g => dayTotals.grades[g.grade_name] != null).map((g, i) => (
                    <div key={g.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${gradeColor(i)}`}>
                      <span className="text-xs font-semibold">{g.grade_name}</span>
                      <span className="text-sm font-black">{dayTotals.grades[g.grade_name]?.toFixed(2)} T</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Entries list */}
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
          : entries.length === 0
            ? (
              <div className="flex flex-col items-center py-16 gap-3 text-slate-600">
                <Factory className="w-12 h-12 opacity-30" />
                <p className="text-sm">No production logged for {viewDate === todayStr() ? 'today' : fmtDate(viewDate)}</p>
                <button onClick={() => setShowForm(true)} className="text-xs text-primary-400 hover:underline">+ Log first entry</button>
              </div>
            )
            : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Entries ({entries.length})</p>
                {entries.map(e => (
                  <div key={e.id} className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{e.equipment_name || '—'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 bg-dark-700 border border-dark-600 text-slate-400 rounded capitalize">
                            {e.shift_type === 'day' ? '☀️' : e.shift_type === 'night' ? '🌙' : '🔄'} {e.shift_type}
                          </span>
                          {e.running_hours && (
                            <span className="text-[10px] text-slate-500">{e.running_hours} hrs</span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setEditEntry({ ...e, outputs: e.crusher_production_outputs })}
                            className="text-slate-500 hover:text-primary-400 transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteEntry(e.id)}
                            className="text-slate-500 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-dark-700 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-slate-500">Raw Input</p>
                        <p className="text-sm font-bold text-slate-200">{fmtT(e.raw_input_tonnes)}</p>
                      </div>
                      <div className="bg-dark-700 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-slate-500">Total Output</p>
                        <p className="text-sm font-bold text-green-400">
                          {fmtT(e.crusher_production_outputs?.reduce((s, o) => s + Number(o.quantity_tonnes), 0))}
                        </p>
                      </div>
                    </div>

                    {e.crusher_production_outputs?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {e.crusher_production_outputs.map((o, i) => {
                          const gi = grades.findIndex(g => g.id === o.grade_id)
                          return (
                            <span key={o.id} className={`text-xs px-2 py-1 rounded-lg border font-semibold ${gradeColor(gi >= 0 ? gi : i)}`}>
                              {o.grade_name}: {Number(o.quantity_tonnes).toFixed(2)} T
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {e.notes && (
                      <p className="text-xs text-slate-500 mt-2 italic">{e.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )
        }
      </div>

      {(showForm || editEntry) && (
        <LogProductionModal
          companyId={companyId} session={session}
          grades={grades} machines={machines}
          existing={editEntry}
          onClose={() => { setShowForm(false); setEditEntry(null) }}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────────
function HistoryTab({ companyId, session, isAdmin }) {
  const qc = useQueryClient()
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [toDate,   setToDate]   = useState(todayStr())
  const [machineFilter, setMachineFilter] = useState('')
  const [editEntry, setEditEntry] = useState(null)

  const { data: grades   = [] } = useGrades(companyId)
  const { data: machines = [] } = useMachines(companyId)

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['crusher_prod_history', companyId, fromDate, toDate, machineFilter],
    queryFn: async () => {
      let q = supabase
        .from('crusher_production')
        .select('*, crusher_production_outputs(*)')
        .eq('company_id', companyId)
        .gte('production_date', fromDate)
        .lte('production_date', toDate)
        .order('production_date', { ascending: false })
        .order('created_at',      { ascending: false })
      if (machineFilter) q = q.eq('equipment_id', machineFilter)
      const { data } = await q
      return data || []
    },
    enabled: !!companyId,
  })

  // Period summary
  const summary = useMemo(() => {
    const totals = { rawInput: 0, totalOutput: 0, grades: {}, days: new Set() }
    entries.forEach(e => {
      totals.rawInput += Number(e.raw_input_tonnes) || 0
      totals.days.add(e.production_date)
      e.crusher_production_outputs?.forEach(o => {
        totals.grades[o.grade_name] = (totals.grades[o.grade_name] || 0) + Number(o.quantity_tonnes)
        totals.totalOutput += Number(o.quantity_tonnes)
      })
    })
    return { ...totals, dayCount: totals.days.size }
  }, [entries])

  const deleteEntry = async (id, date) => {
    if (!window.confirm('Delete this production entry?')) return
    const { error } = await supabase.from('crusher_production').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Entry deleted')
    qc.invalidateQueries(['crusher_prod_history', companyId])
    qc.invalidateQueries(['crusher_prod_day', companyId, date])
  }

  const onSaved = () => {
    setEditEntry(null)
    qc.invalidateQueries(['crusher_prod_history', companyId])
    qc.invalidateQueries(['crusher_prod_day', companyId])
  }

  // Group entries by date
  const grouped = useMemo(() => {
    const map = {}
    entries.forEach(e => {
      if (!map[e.production_date]) map[e.production_date] = []
      map[e.production_date].push(e)
    })
    return map
  }, [entries])

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="px-4 py-3 border-b border-dark-700 shrink-0 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className={inp} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <input type="date" className={inp} value={toDate}   onChange={e => setToDate(e.target.value)} />
        </div>
        <select className={inp} value={machineFilter} onChange={e => setMachineFilter(e.target.value)}>
          <option value="">All machines</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.equipment_number} — {m.name}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Period summary */}
        {entries.length > 0 && (
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 mb-3">
              Period Summary — {summary.dayCount} days · {entries.length} entries
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[10px] text-slate-500">Total Raw Input</p>
                <p className="text-lg font-black text-slate-100">{summary.rawInput.toFixed(2)} <span className="text-xs font-normal text-slate-500">T</span></p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Total Output</p>
                <p className="text-lg font-black text-green-400">{summary.totalOutput.toFixed(2)} <span className="text-xs font-normal text-slate-500">T</span></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {grades.filter(g => summary.grades[g.grade_name]).map((g, i) => (
                <span key={g.id} className={`text-xs px-2 py-1 rounded-lg border font-semibold ${gradeColor(i)}`}>
                  {g.grade_name}: {summary.grades[g.grade_name]?.toFixed(2)} T
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grouped by date */}
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
          : Object.keys(grouped).length === 0
            ? (
              <div className="flex flex-col items-center py-16 gap-2 text-slate-600">
                <BarChart3 className="w-10 h-10 opacity-30" />
                <p className="text-sm">No production in selected range</p>
              </div>
            )
            : Object.entries(grouped).map(([date, dayEntries]) => {
                const dayTotal = dayEntries.reduce((s, e) =>
                  s + (e.crusher_production_outputs?.reduce((ss, o) => ss + Number(o.quantity_tonnes), 0) || 0), 0)
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-400">{fmtDate(date)}</p>
                      <span className="text-xs text-green-400 font-mono">{dayTotal.toFixed(2)} T out</span>
                    </div>
                    <div className="space-y-2">
                      {dayEntries.map(e => (
                        <div key={e.id} className="bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-slate-200 truncate">{e.equipment_name || '—'}</span>
                              <span className="text-[10px] text-slate-500 capitalize">
                                {e.shift_type === 'day' ? '☀️' : e.shift_type === 'night' ? '🌙' : '🔄'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {e.crusher_production_outputs?.map((o, i) => {
                                const gi = grades.findIndex(g => g.id === o.grade_id)
                                return (
                                  <span key={o.id} className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${gradeColor(gi >= 0 ? gi : i)}`}>
                                    {o.grade_name} {Number(o.quantity_tonnes).toFixed(2)}T
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-slate-500">Input</p>
                            <p className="text-sm font-bold text-slate-200">{fmtT(e.raw_input_tonnes)}</p>
                          </div>
                          {isAdmin && (
                            <div className="flex flex-col gap-1.5 shrink-0">
                              <button onClick={() => setEditEntry({ ...e, outputs: e.crusher_production_outputs })}
                                className="text-slate-500 hover:text-primary-400">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteEntry(e.id, e.production_date)}
                                className="text-slate-500 hover:text-red-400">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
        }
      </div>

      {editEntry && (
        <LogProductionModal
          companyId={companyId} session={session}
          grades={grades} machines={machines}
          existing={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

// ── Daily Ops constants ───────────────────────────────────────────────────────
const OPS_EQUIPMENT_CATEGORIES = [
  'Excavator (Hydraulic)', 'Wheel Loader',
  'Tipper / Dumper', 'Pickup Truck', 'Water Tanker',
  'Mobile Crane', 'Forklift',
  'Generator / DG Set', 'Air Compressor', 'Dewatering Pump', 'Other',
]

const OPS_GROUPS = [
  { label: 'Earth Moving', emoji: '⛏️', cats: ['Excavator (Hydraulic)', 'Wheel Loader'] },
  { label: 'Transport',    emoji: '🚛', cats: ['Tipper / Dumper', 'Pickup Truck', 'Water Tanker'] },
  { label: 'Lifting',      emoji: '🏗️', cats: ['Mobile Crane', 'Forklift'] },
  { label: 'Power & Support', emoji: '⚡', cats: ['Generator / DG Set', 'Air Compressor', 'Dewatering Pump'] },
  { label: 'Other',        emoji: '🔧', cats: ['Other'] },
]

const OPS_STATUSES = [
  { value: 'working',     label: 'Working',     color: 'text-green-400 bg-green-500/10 border-green-700/30' },
  { value: 'idle',        label: 'Idle',        color: 'text-yellow-400 bg-yellow-500/10 border-yellow-700/30' },
  { value: 'breakdown',   label: 'Breakdown',   color: 'text-red-400 bg-red-500/10 border-red-700/30' },
  { value: 'maintenance', label: 'Maintenance', color: 'text-blue-400 bg-blue-500/10 border-blue-700/30' },
]

// meter_type per category — drives which fields appear in the log form
const CAT_METER = {
  'Excavator (Hydraulic)': 'hours',
  'Wheel Loader':          'hours',
  'Tipper / Dumper':       'both',
  'Pickup Truck':          'kilometers',
  'Water Tanker':          'both',
  'Mobile Crane':          'both',
  'Forklift':              'hours',
  'Generator / DG Set':    'hours',
  'Air Compressor':        'hours',
  'Dewatering Pump':       'hours',
  'Other':                 'hours',
}
const TRANSPORT_CATS   = ['Tipper / Dumper', 'Water Tanker', 'Pickup Truck']
const EARTHMOV_CATS    = ['Excavator (Hydraulic)', 'Wheel Loader']

// ── useOpsEquipment hook ──────────────────────────────────────────────────────
function useOpsEquipment(companyId) {
  return useQuery({
    queryKey: ['ops_equipment', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment')
        .select('id, name, equipment_number, category')
        .eq('company_id', companyId)
        .in('status', ['active', 'idle'])
        .in('category', OPS_EQUIPMENT_CATEGORIES)
        .order('category')
        .order('equipment_number')
      return data || []
    },
    enabled: !!companyId,
  })
}

// ── Assignment constants ──────────────────────────────────────────────────────
const ASSIGN_ROLES = [
  { value: 'primary_operator',   label: 'Primary Operator',    short: 'P.Operator', color: 'text-blue-400 bg-blue-500/10 border-blue-700/30' },
  { value: 'assistant_operator', label: 'Assistant Operator',  short: 'Assistant',  color: 'text-indigo-400 bg-indigo-500/10 border-indigo-700/30' },
  { value: 'driver',             label: 'Driver',              short: 'Driver',     color: 'text-teal-400 bg-teal-500/10 border-teal-700/30' },
  { value: 'helper',             label: 'Helper',              short: 'Helper',     color: 'text-slate-400 bg-dark-700 border-dark-600' },
]

const ASSIGN_STATUSES = [
  { value: 'assigned',  label: 'Assigned',  color: 'text-slate-400 bg-dark-700 border-dark-600' },
  { value: 'present',   label: 'Present',   color: 'text-green-400 bg-green-500/10 border-green-700/30' },
  { value: 'half_day',  label: 'Half Day',  color: 'text-yellow-400 bg-yellow-500/10 border-yellow-700/30' },
  { value: 'absent',    label: 'Absent',    color: 'text-red-400 bg-red-500/10 border-red-700/30' },
]

// ── useOperatorEmployees hook ─────────────────────────────────────────────────
function useOperatorEmployees(companyId) {
  return useQuery({
    queryKey: ['operator_employees', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('hr_employees')
        .select('id, name, designation, employee_number')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('name')
      return data || []
    },
    enabled: !!companyId,
  })
}

// ── useAssignments hook ───────────────────────────────────────────────────────
function useAssignments(companyId, date) {
  return useQuery({
    queryKey: ['equipment_assignments', companyId, date],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment_assignments')
        .select('*')
        .eq('company_id', companyId)
        .eq('assignment_date', date)
        .order('equipment_name')
        .order('assignment_role')
      return data || []
    },
    enabled: !!companyId,
  })
}

// ── AssignmentCard ────────────────────────────────────────────────────────────
function AssignmentCard({ a, isAdmin, onStatus, onEdit, onDelete }) {
  const ri = ASSIGN_ROLES.find(r => r.value === a.assignment_role) || ASSIGN_ROLES[0]
  const si = ASSIGN_STATUSES.find(s => s.value === a.status) || ASSIGN_STATUSES[0]
  return (
    <div className={`bg-dark-800 border rounded-xl px-3 py-2.5 ${
      a.status === 'absent' ? 'border-red-800/40' :
      a.status === 'present' ? 'border-green-800/30' :
      a.status === 'half_day' ? 'border-yellow-800/30' : 'border-dark-700'
    }`}>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Employee info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold text-slate-100">{a.employee_name || '—'}</p>
            <span className="text-[10px] font-mono text-slate-500">{a.employee_number}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${ri.color}`}>
              {ri.short}
            </span>
            <span className="text-[10px] text-slate-600">
              {a.shift_type === 'day' ? '☀️' : a.shift_type === 'night' ? '🌙' : '🔄'}
            </span>
          </div>
          {a.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">{a.notes}</p>}
        </div>
        {/* Status toggle row */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {['present', 'half_day', 'absent'].map(sv => {
            const sInfo = ASSIGN_STATUSES.find(x => x.value === sv)
            const isActive = a.status === sv
            return (
              <button key={sv}
                onClick={() => onStatus(a, isActive ? 'assigned' : sv)}
                title={sInfo.label}
                className={`text-[10px] px-2 py-1 rounded-lg border font-semibold transition-all ${
                  isActive ? sInfo.color : 'border-dark-600 text-slate-600 hover:text-slate-400 hover:border-dark-500'
                }`}>
                {sv === 'present' ? '✓' : sv === 'half_day' ? '½' : '✗'}
              </button>
            )
          })}
          {isAdmin && (
            <>
              <button onClick={onEdit} className="text-slate-600 hover:text-primary-400 p-1 transition-colors">
                <Edit2 className="w-3 h-3" />
              </button>
              <button onClick={onDelete} className="text-slate-600 hover:text-red-400 p-1 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Assign Modal ──────────────────────────────────────────────────────────────
function AssignModal({ companyId, session, opsEquipment, employees, existing, viewDate, onClose, onSaved }) {
  const isEdit = !!existing
  const [date,        setDate]        = useState(existing?.assignment_date || viewDate || todayStr())
  const [shift,       setShift]       = useState(existing?.shift_type      || 'day')
  const [equipmentId, setEquipmentId] = useState(existing?.equipment_id    || '')
  const [employeeId,  setEmployeeId]  = useState(existing?.employee_id     || '')
  const [role,        setRole]        = useState(existing?.assignment_role  || 'primary_operator')
  const [notes,       setNotes]       = useState(existing?.notes            || '')
  const [saving,      setSaving]      = useState(false)

  const handleSave = async () => {
    if (!equipmentId) return toast.error('Select an equipment')
    if (!employeeId)  return toast.error('Select an employee')
    setSaving(true)
    try {
      const eq  = opsEquipment.find(e => e.id === equipmentId)
      const emp = employees.find(e => e.id === employeeId)
      const payload = {
        company_id:       companyId,
        assignment_date:  date,
        shift_type:       shift,
        equipment_id:     equipmentId,
        equipment_name:   eq  ? `${eq.equipment_number} — ${eq.name}` : null,
        employee_id:      employeeId,
        employee_name:    emp?.name            || null,
        employee_number:  emp?.employee_number || null,
        assignment_role:  role,
        notes:            notes.trim() || null,
        assigned_by:      session.user.id,
      }
      if (isEdit) {
        const { error } = await supabase.from('equipment_assignments').update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('equipment_assignments').insert(payload)
        if (error) throw error
      }
      toast.success(isEdit ? 'Assignment updated' : 'Employee assigned')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <p className="text-sm font-bold text-slate-100">{isEdit ? 'Edit Assignment' : 'Assign Operator / Driver'}</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          {/* Date + Shift */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Date *</p>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Shift</p>
              <select className={inp} value={shift} onChange={e => setShift(e.target.value)}>
                <option value="day">☀️ Day</option>
                <option value="night">🌙 Night</option>
                <option value="general">🔄 General</option>
              </select>
            </div>
          </div>

          {/* Equipment */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Equipment *</p>
            <select className={inp} value={equipmentId} onChange={e => setEquipmentId(e.target.value)}>
              <option value="">Select equipment…</option>
              {opsEquipment.map(e => (
                <option key={e.id} value={e.id}>{e.equipment_number} — {e.name}</option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Operator / Driver *</p>
            {employees.length === 0 ? (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                ⚠️ No active employees. Add them in the HR module first.
              </div>
            ) : (
              <select className={inp} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Select employee…</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.employee_number} — {e.name}{e.designation ? ` · ${e.designation}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Role chips */}
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Role in this assignment</p>
            <div className="flex flex-wrap gap-2">
              {ASSIGN_ROLES.map(r => (
                <button key={r.value} onClick={() => setRole(r.value)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                    role === r.value ? r.color : 'border-dark-600 text-slate-500 hover:text-slate-300 hover:border-dark-500'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Notes / Instructions</p>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any specific instructions for this assignment…" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 btn-primary flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Log Daily Operation Modal ─────────────────────────────────────────────────
function LogOpsModal({ companyId, session, opsEquipment, existing, onClose, onSaved }) {
  const isEdit = !!existing

  const [date,          setDate]          = useState(existing?.ops_date       || todayStr())
  const [shift,         setShift]         = useState(existing?.shift_type      || 'day')
  const [equipmentId,   setEquipmentId]   = useState(existing?.equipment_id    || '')
  const [status,        setStatus]        = useState(existing?.status           || 'working')
  const [runningHours,  setRunningHours]  = useState(existing?.running_hours?.toString()  || '')
  const [kmRun,         setKmRun]         = useState(existing?.kilometer_run?.toString()  || '')
  const [tripCount,     setTripCount]     = useState(existing?.trip_count?.toString()     || '')
  const [fuelConsumed,  setFuelConsumed]  = useState(existing?.fuel_consumed?.toString()  || '')
  const [materialMoved, setMaterialMoved] = useState(existing?.material_moved?.toString() || '')
  const [operatorName,  setOperatorName]  = useState(existing?.operator_name   || '')
  const [activity,      setActivity]      = useState(existing?.activity         || '')
  const [notes,         setNotes]         = useState(existing?.notes            || '')
  const [saving,        setSaving]        = useState(false)

  const selEquip      = opsEquipment.find(e => e.id === equipmentId)
  const meterType     = selEquip ? (CAT_METER[selEquip.category] || 'hours') : null
  const isTransport   = selEquip ? TRANSPORT_CATS.includes(selEquip.category) : false
  const isEarthMov    = selEquip ? EARTHMOV_CATS.includes(selEquip.category)  : false
  const showHours     = meterType === 'hours'     || meterType === 'both'
  const showKm        = meterType === 'kilometers' || meterType === 'both'
  const showTrips     = isTransport
  const showMaterial  = isTransport || isEarthMov

  const handleSave = async () => {
    if (!equipmentId) return toast.error('Select an equipment')
    setSaving(true)
    try {
      const eq = opsEquipment.find(e => e.id === equipmentId)
      const payload = {
        company_id:     companyId,
        ops_date:       date,
        shift_type:     shift,
        equipment_id:   equipmentId,
        equipment_name: eq ? `${eq.equipment_number} — ${eq.name}` : null,
        equipment_type: eq?.category || null,
        status,
        running_hours:  showHours    && runningHours   ? parseFloat(runningHours)   : null,
        kilometer_run:  showKm       && kmRun          ? parseFloat(kmRun)          : null,
        trip_count:     showTrips    && tripCount      ? parseInt(tripCount)         : null,
        fuel_consumed:  fuelConsumed                   ? parseFloat(fuelConsumed)   : null,
        material_moved: showMaterial && materialMoved  ? parseFloat(materialMoved)  : null,
        operator_name:  operatorName.trim() || null,
        activity:       activity.trim()     || null,
        notes:          notes.trim()        || null,
        created_by:     session.user.id,
      }
      if (isEdit) {
        const { error } = await supabase.from('daily_operations').update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('daily_operations').insert(payload)
        if (error) throw error
      }
      toast.success(isEdit ? 'Operation updated' : 'Operation logged')
      onSaved()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <p className="text-sm font-bold text-slate-100">{isEdit ? 'Edit Operation' : 'Log Daily Operation'}</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          {/* Date + Shift */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Date *</p>
              <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Shift</p>
              <select className={inp} value={shift} onChange={e => setShift(e.target.value)}>
                <option value="day">☀️ Day</option>
                <option value="night">🌙 Night</option>
                <option value="general">🔄 General</option>
              </select>
            </div>
          </div>

          {/* Equipment picker */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Equipment *</p>
            {opsEquipment.length === 0 ? (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                ⚠️ No support equipment found. Add excavators, tippers, DG sets etc. in Equipment &amp; Machines first.
              </div>
            ) : (
              <select className={inp} value={equipmentId} onChange={e => setEquipmentId(e.target.value)}>
                <option value="">Select equipment…</option>
                {opsEquipment.map(e => (
                  <option key={e.id} value={e.id}>{e.equipment_number} — {e.name}{e.category ? ` (${e.category})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          {/* Status chips */}
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Status</p>
            <div className="flex gap-2 flex-wrap">
              {OPS_STATUSES.map(s => (
                <button key={s.value} onClick={() => setStatus(s.value)}
                  className={`text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all ${
                    status === s.value ? s.color : 'border-dark-600 text-slate-500 hover:text-slate-300 hover:border-dark-500'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hours + KM (adaptive) */}
          {equipmentId && (showHours || showKm) && (
            <div className={`grid gap-3 ${showHours && showKm ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showHours && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Running Hours</p>
                  <input type="number" className={inp} value={runningHours}
                    onChange={e => setRunningHours(e.target.value)} step="0.5" placeholder="0.0" min="0" />
                </div>
              )}
              {showKm && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">KM Run</p>
                  <input type="number" className={inp} value={kmRun}
                    onChange={e => setKmRun(e.target.value)} step="1" placeholder="0" min="0" />
                </div>
              )}
            </div>
          )}

          {/* Trips + Material (transport / earth-moving) */}
          {equipmentId && (showTrips || showMaterial) && (
            <div className={`grid gap-3 ${showTrips && showMaterial ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {showTrips && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Trip Count</p>
                  <input type="number" className={inp} value={tripCount}
                    onChange={e => setTripCount(e.target.value)} step="1" placeholder="0" min="0" />
                </div>
              )}
              {showMaterial && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Material Moved (T)</p>
                  <input type="number" className={inp} value={materialMoved}
                    onChange={e => setMaterialMoved(e.target.value)} step="0.001" placeholder="0.000" min="0" />
                </div>
              )}
            </div>
          )}

          {/* Fuel */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Fuel Consumed (Litres)</p>
            <input type="number" className={inp} value={fuelConsumed}
              onChange={e => setFuelConsumed(e.target.value)} step="0.5" placeholder="0.0" min="0" />
          </div>

          {/* Operator + Activity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Operator</p>
              <input className={inp} value={operatorName} onChange={e => setOperatorName(e.target.value)}
                placeholder="Name" />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Activity / Work Done</p>
              <input className={inp} value={activity} onChange={e => setActivity(e.target.value)}
                placeholder="e.g. Loading, excavation…" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs text-slate-400 mb-1">Notes</p>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Breakdowns, fuel readings, issues…" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-dark-700 flex gap-3">
          <button onClick={onClose} className="flex-1 btn-ghost">Cancel</button>
          <button onClick={handleSave} disabled={saving || opsEquipment.length === 0}
            className="flex-1 btn-primary flex items-center justify-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Update' : 'Log Operation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DAILY OPS TAB ─────────────────────────────────────────────────────────────
function DailyOpsTab({ companyId, session, isAdmin }) {
  const qc = useQueryClient()
  const [section,        setSection]        = useState('assignments') // 'assignments' | 'operations'
  const [showForm,       setShowForm]       = useState(false)
  const [editEntry,      setEditEntry]      = useState(null)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [editAssignment, setEditAssignment] = useState(null)
  const [viewDate,       setViewDate]       = useState(todayStr())

  const { data: opsEquipment = [] } = useOpsEquipment(companyId)
  const { data: employees    = [] } = useOperatorEmployees(companyId)
  const { data: assignments  = [], isLoading: assignLoading } = useAssignments(companyId, viewDate)

  const { data: entries = [], isLoading: opsLoading } = useQuery({
    queryKey: ['daily_ops', companyId, viewDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_operations').select('*')
        .eq('company_id', companyId).eq('ops_date', viewDate)
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!companyId,
  })

  const prevDay = () => setViewDate(format(subDays(parseISO(viewDate), 1), 'yyyy-MM-dd'))
  const nextDay = () => {
    const next = format(new Date(new Date(viewDate).getTime() + 86400000), 'yyyy-MM-dd')
    if (next <= todayStr()) setViewDate(next)
  }

  // ── Assignment actions ──────────────────────────────────────────────────────
  const updateAssignmentStatus = async (assignment, newStatus) => {
    try {
      await supabase.from('equipment_assignments').update({ status: newStatus }).eq('id', assignment.id)

      // Sync to hr_attendance (only for confirmed statuses)
      if (newStatus !== 'assigned') {
        const { data: existing } = await supabase
          .from('hr_attendance').select('id')
          .eq('employee_id', assignment.employee_id)
          .eq('attendance_date', assignment.assignment_date)
          .maybeSingle()

        const attPayload = { status: newStatus, source: 'equipment_assignment' }
        if (existing) {
          await supabase.from('hr_attendance').update(attPayload).eq('id', existing.id)
        } else {
          await supabase.from('hr_attendance').insert({
            company_id: companyId,
            employee_id: assignment.employee_id,
            attendance_date: assignment.assignment_date,
            ...attPayload,
          })
        }
        toast.success(`${assignment.employee_name} marked ${newStatus.replace('_', ' ')} — attendance updated`)
      } else {
        toast.success('Status reset to Assigned')
      }
      qc.invalidateQueries(['equipment_assignments', companyId, viewDate])
    } catch (e) { toast.error(e.message) }
  }

  const deleteAssignment = async (id) => {
    if (!window.confirm('Remove this assignment?')) return
    await supabase.from('equipment_assignments').delete().eq('id', id)
    qc.invalidateQueries(['equipment_assignments', companyId, viewDate])
    toast.success('Assignment removed')
  }

  const onAssignSaved = () => {
    setShowAssignForm(false); setEditAssignment(null)
    qc.invalidateQueries(['equipment_assignments', companyId, viewDate])
  }

  // ── Ops actions ─────────────────────────────────────────────────────────────
  const deleteEntry = async (id) => {
    if (!window.confirm('Delete this operation log?')) return
    const { error } = await supabase.from('daily_operations').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Entry deleted')
    qc.invalidateQueries(['daily_ops', companyId, viewDate])
  }
  const onOpsSaved = () => {
    setShowForm(false); setEditEntry(null)
    qc.invalidateQueries(['daily_ops', companyId, viewDate])
  }

  // ── Assignments — group by equipment, then compute summary ──────────────────
  const assignByEquip = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      const key = a.equipment_id || '__none__'
      if (!map[key]) map[key] = { name: a.equipment_name || 'Unassigned equipment', list: [] }
      map[key].list.push(a)
    })
    return Object.values(map)
  }, [assignments])

  const assignSummary = useMemo(() => {
    const sc = { assigned: 0, present: 0, half_day: 0, absent: 0 }
    assignments.forEach(a => { sc[a.status] = (sc[a.status] || 0) + 1 })
    return { ...sc, total: assignments.length }
  }, [assignments])

  // ── Operations aggregates ───────────────────────────────────────────────────
  const daySummary = useMemo(() => {
    const sc = { working: 0, idle: 0, breakdown: 0, maintenance: 0 }
    let hours = 0, fuel = 0, trips = 0, km = 0
    entries.forEach(e => {
      sc[e.status] = (sc[e.status] || 0) + 1
      hours += Number(e.running_hours) || 0
      fuel  += Number(e.fuel_consumed) || 0
      trips += Number(e.trip_count)    || 0
      km    += Number(e.kilometer_run) || 0
    })
    return { sc, hours, fuel, trips, km, total: entries.length }
  }, [entries])

  const grouped = useMemo(() => (
    OPS_GROUPS.map(g => ({
      ...g,
      entries: entries.filter(e => g.cats.includes(e.equipment_type)),
    })).filter(g => g.entries.length > 0)
  ), [entries])

  const opsStatusInfo = (val) => OPS_STATUSES.find(s => s.value === val) || OPS_STATUSES[0]

  return (
    <div className="flex flex-col h-full">
      {/* Date nav */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={prevDay} className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-slate-100 min-w-[120px] text-center">
            {viewDate === todayStr() ? 'Today' : fmtDate(viewDate)}
          </span>
          <button onClick={nextDay} disabled={viewDate >= todayStr()}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-slate-400 hover:text-slate-200 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {section === 'assignments'
          ? <button onClick={() => setShowAssignForm(true)}
              className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
              <Plus className="w-4 h-4" /> Assign
            </button>
          : <button onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2">
              <Plus className="w-4 h-4" /> Log Operation
            </button>
        }
      </div>

      {/* Section toggle */}
      <div className="px-4 py-2 border-b border-dark-700 shrink-0 flex gap-1">
        {[
          { key: 'assignments', label: `👥 Assignments${assignments.length > 0 ? ` (${assignments.length})` : ''}` },
          { key: 'operations',  label: `📋 Operations${entries.length > 0 ? ` (${entries.length})` : ''}` },
        ].map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
              section === s.key
                ? 'bg-primary-600/20 border-primary-500/50 text-primary-300'
                : 'bg-dark-800 border-dark-700 text-slate-500 hover:text-slate-300'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── ASSIGNMENTS SECTION ── */}
        {section === 'assignments' && (
          <>
            {/* Summary strip */}
            {assignments.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total',    val: assignSummary.total,    color: 'text-slate-200' },
                  { label: 'Present',  val: assignSummary.present,  color: 'text-green-400' },
                  { label: 'Half Day', val: assignSummary.half_day, color: 'text-yellow-400' },
                  { label: 'Absent',   val: assignSummary.absent,   color: 'text-red-400' },
                ].map(c => (
                  <div key={c.label} className="bg-dark-800 border border-dark-700 rounded-xl p-2 text-center">
                    <p className="text-[10px] text-slate-500">{c.label}</p>
                    <p className={`text-lg font-black ${c.color}`}>{c.val}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Assignments grouped by equipment */}
            {assignLoading
              ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
              : assignments.length === 0
                ? (
                  <div className="flex flex-col items-center py-16 gap-3 text-slate-600">
                    <Truck className="w-12 h-12 opacity-30" />
                    <p className="text-sm">No assignments for {viewDate === todayStr() ? 'today' : fmtDate(viewDate)}</p>
                    <p className="text-xs text-slate-600 text-center max-w-xs">Assign operators and drivers to equipment before the shift starts</p>
                    <button onClick={() => setShowAssignForm(true)} className="text-xs text-primary-400 hover:underline">
                      + Create first assignment
                    </button>
                  </div>
                )
                : assignByEquip.map(group => (
                  <div key={group.name}>
                    <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500 inline-block" />
                      {group.name}
                    </p>
                    <div className="space-y-1.5">
                      {group.list.map(a => (
                        <AssignmentCard
                          key={a.id} a={a} isAdmin={isAdmin}
                          onStatus={updateAssignmentStatus}
                          onEdit={() => setEditAssignment(a)}
                          onDelete={() => deleteAssignment(a.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
            }
          </>
        )}

        {/* ── OPERATIONS SECTION ── */}
        {section === 'operations' && (
          <>
            {/* Day summary cards */}
            {entries.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Active Equipment</p>
                    <p className="text-xl font-black text-green-400">{daySummary.sc.working || 0}
                      <span className="text-xs font-normal text-slate-500"> / {daySummary.total}</span>
                    </p>
                  </div>
                  <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Hours Logged</p>
                    <p className="text-xl font-black text-blue-400">{daySummary.hours.toFixed(1)}
                      <span className="text-xs font-normal text-slate-500"> hrs</span>
                    </p>
                  </div>
                  {daySummary.fuel > 0 && (
                    <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                      <p className="text-xs text-slate-500 mb-1">Fuel Consumed</p>
                      <p className="text-xl font-black text-orange-400">{daySummary.fuel.toFixed(1)}
                        <span className="text-xs font-normal text-slate-500"> L</span>
                      </p>
                    </div>
                  )}
                  {daySummary.trips > 0 && (
                    <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                      <p className="text-xs text-slate-500 mb-1">Total Trips</p>
                      <p className="text-xl font-black text-teal-400">{daySummary.trips}
                        <span className="text-xs font-normal text-slate-500"> trips</span>
                      </p>
                    </div>
                  )}
                  {daySummary.km > 0 && (
                    <div className="bg-dark-800 border border-dark-700 rounded-xl p-3">
                      <p className="text-xs text-slate-500 mb-1">KM Run</p>
                      <p className="text-xl font-black text-purple-400">{daySummary.km.toFixed(0)}
                        <span className="text-xs font-normal text-slate-500"> km</span>
                      </p>
                    </div>
                  )}
                </div>
                {(daySummary.sc.breakdown > 0 || daySummary.sc.maintenance > 0 || daySummary.sc.idle > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {daySummary.sc.breakdown > 0 && (
                      <span className="text-xs px-2.5 py-1 rounded-xl bg-red-500/10 border border-red-700/30 text-red-400 font-semibold">
                        🔴 {daySummary.sc.breakdown} Breakdown{daySummary.sc.breakdown > 1 ? 's' : ''}
                      </span>
                    )}
                    {daySummary.sc.maintenance > 0 && (
                      <span className="text-xs px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-700/30 text-blue-400 font-semibold">
                        🔧 {daySummary.sc.maintenance} Under Maintenance
                      </span>
                    )}
                    {daySummary.sc.idle > 0 && (
                      <span className="text-xs px-2.5 py-1 rounded-xl bg-yellow-500/10 border border-yellow-700/30 text-yellow-400 font-semibold">
                        💤 {daySummary.sc.idle} Idle
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Entry list grouped by category */}
            {opsLoading
              ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
              : entries.length === 0
                ? (
                  <div className="flex flex-col items-center py-16 gap-3 text-slate-600">
                    <Clipboard className="w-12 h-12 opacity-30" />
                    <p className="text-sm">No operations logged for {viewDate === todayStr() ? 'today' : fmtDate(viewDate)}</p>
                    <button onClick={() => setShowForm(true)} className="text-xs text-primary-400 hover:underline">
                      + Log first entry
                    </button>
                  </div>
                )
                : grouped.map(group => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      {group.emoji} {group.label}
                    </p>
                    <div className="space-y-2">
                      {group.entries.map(e => {
                        const si = opsStatusInfo(e.status)
                        return (
                          <div key={e.id} className={`bg-dark-800 border rounded-xl p-4 ${
                            e.status === 'breakdown'   ? 'border-red-800/50'  :
                            e.status === 'maintenance' ? 'border-blue-800/40' :
                            e.status === 'idle'        ? 'border-yellow-800/40' : 'border-dark-700'
                          }`}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <p className="text-sm font-semibold text-slate-100 truncate">{e.equipment_name || '—'}</p>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${si.color}`}>
                                    {si.label}
                                  </span>
                                  <span className="text-[10px] text-slate-500 flex-shrink-0">
                                    {e.shift_type === 'day' ? '☀️ Day' : e.shift_type === 'night' ? '🌙 Night' : '🔄 General'}
                                  </span>
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button onClick={() => setEditEntry(e)} className="text-slate-500 hover:text-primary-400 transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => deleteEntry(e.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {e.running_hours  != null && <span className="text-xs px-2 py-1 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 font-mono">⏱ {Number(e.running_hours).toFixed(1)} hrs</span>}
                              {e.kilometer_run  != null && <span className="text-xs px-2 py-1 rounded-lg bg-dark-700 border border-dark-600 text-slate-300 font-mono">📍 {Number(e.kilometer_run).toFixed(0)} km</span>}
                              {e.trip_count     != null && <span className="text-xs px-2 py-1 rounded-lg bg-teal-500/10 border border-teal-700/30 text-teal-300 font-mono">🔄 {e.trip_count} trips</span>}
                              {e.material_moved != null && <span className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-700/30 text-amber-300 font-mono">📦 {Number(e.material_moved).toFixed(2)} T</span>}
                              {e.fuel_consumed  != null && <span className="text-xs px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-700/30 text-orange-300 font-mono">⛽ {Number(e.fuel_consumed).toFixed(1)} L</span>}
                            </div>
                            {e.activity && <p className="text-xs text-slate-400 mt-2">📋 {e.activity}</p>}
                            {e.notes    && <p className="text-xs text-slate-500 mt-1 italic">{e.notes}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
            }
          </>
        )}
      </div>

      {/* Modals */}
      {(showForm || editEntry) && (
        <LogOpsModal
          companyId={companyId} session={session}
          opsEquipment={opsEquipment} existing={editEntry}
          onClose={() => { setShowForm(false); setEditEntry(null) }}
          onSaved={onOpsSaved}
        />
      )}
      {(showAssignForm || editAssignment) && (
        <AssignModal
          companyId={companyId} session={session}
          opsEquipment={opsEquipment} employees={employees}
          existing={editAssignment} viewDate={viewDate}
          onClose={() => { setShowAssignForm(false); setEditAssignment(null) }}
          onSaved={onAssignSaved}
        />
      )}
    </div>
  )
}

// ── GRADES TAB ────────────────────────────────────────────────────────────────
function GradesTab({ companyId }) {
  const qc = useQueryClient()
  const [adding, setAdding]   = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [seeding, setSeeding] = useState(false)

  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['crusher_grades_all', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('crusher_grades')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order')
      return data || []
    },
    enabled: !!companyId,
  })

  const seedDefaults = async () => {
    setSeeding(true)
    const defaults = [
      { grade_name: 'M Sand',   description: 'Manufactured Sand — fine aggregate for concrete', sort_order: 1 },
      { grade_name: 'P Sand',   description: 'Plastering Sand — fine grade for plastering',     sort_order: 2 },
      { grade_name: 'Power',    description: 'Power Sand',                                       sort_order: 3 },
      { grade_name: 'GSB',      description: 'Granular Sub Base — road base layer',              sort_order: 4 },
      { grade_name: 'Wetmix',   description: 'Wet Mix Macadam — road construction layer',        sort_order: 5 },
      { grade_name: '40mm',     description: 'Coarse aggregate 40mm',                            sort_order: 6 },
      { grade_name: '20mm',     description: 'Coarse aggregate 20mm',                            sort_order: 7 },
      { grade_name: '12mm',     description: 'Coarse aggregate 12mm',                            sort_order: 8 },
      { grade_name: '6mm',      description: 'Fine aggregate 6mm',                               sort_order: 9 },
      { grade_name: 'Dust',     description: 'Quarry dust / fines',                              sort_order: 10 },
      { grade_name: 'Rejects',  description: 'Rejected / waste material',                        sort_order: 11 },
    ]
    try {
      for (const d of defaults) {
        await supabase.from('crusher_grades').upsert(
          { ...d, company_id: companyId, is_active: true },
          { onConflict: 'company_id,grade_name', ignoreDuplicates: true }
        )
      }
      toast.success('Default grades seeded')
      qc.invalidateQueries(['crusher_grades', companyId])
      qc.invalidateQueries(['crusher_grades_all', companyId])
    } catch (e) { toast.error(e.message) } finally { setSeeding(false) }
  }

  const addGrade = async () => {
    if (!newName.trim()) return toast.error('Grade name is required')
    setSaving(true)
    try {
      const { error } = await supabase.from('crusher_grades').insert({
        company_id: companyId,
        grade_name: newName.trim(),
        description: newDesc.trim() || null,
        sort_order: grades.length + 1,
      })
      if (error) throw error
      toast.success('Grade added')
      setNewName(''); setNewDesc(''); setAdding(false)
      qc.invalidateQueries(['crusher_grades', companyId])
      qc.invalidateQueries(['crusher_grades_all', companyId])
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const toggleActive = async (g) => {
    const { error } = await supabase.from('crusher_grades')
      .update({ is_active: !g.is_active }).eq('id', g.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries(['crusher_grades', companyId])
    qc.invalidateQueries(['crusher_grades_all', companyId])
  }

  const deleteGrade = async (g) => {
    if (!window.confirm(`Delete grade "${g.grade_name}"? This cannot be undone if used in production records.`)) return
    const { error } = await supabase.from('crusher_grades').delete().eq('id', g.id)
    if (error) { toast.error(error.message); return }
    toast.success('Grade deleted')
    qc.invalidateQueries(['crusher_grades', companyId])
    qc.invalidateQueries(['crusher_grades_all', companyId])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between shrink-0">
        <div>
          <p className="text-sm font-semibold text-slate-200">Product Grades</p>
          <p className="text-xs text-slate-500">Define the grades your plant produces</p>
        </div>
        <div className="flex items-center gap-2">
          {grades.length === 0 && (
            <button onClick={seedDefaults} disabled={seeding}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border border-amber-700/40 bg-amber-900/20 text-amber-400 hover:bg-amber-900/30">
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Seed Defaults
            </button>
          )}
          <button onClick={() => setAdding(true)}
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-2">
            <Plus className="w-3.5 h-3.5" /> Add Grade
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {isLoading
          ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary-400" /></div>
          : grades.length === 0
            ? (
              <div className="flex flex-col items-center py-16 gap-3 text-slate-600">
                <Layers className="w-10 h-10 opacity-30" />
                <p className="text-sm">No grades yet</p>
                <p className="text-xs text-slate-600">Click "Seed Defaults" to add standard grades (M Sand, P Sand, Power, GSB, Wetmix, aggregates)</p>
              </div>
            )
            : grades.map((g, i) => (
              <div key={g.id} className={`flex items-center gap-3 bg-dark-800 border rounded-xl px-4 py-3 ${g.is_active ? 'border-dark-700' : 'border-dark-800 opacity-50'}`}>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg border w-16 text-center flex-shrink-0 ${gradeColor(i)}`}>
                  {g.grade_name}
                </span>
                <div className="flex-1 min-w-0">
                  {g.description && <p className="text-xs text-slate-500">{g.description}</p>}
                  <p className="text-[10px] text-slate-600">Order: {g.sort_order}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(g)}
                    className={`text-xs px-2 py-1 rounded-lg border ${g.is_active ? 'border-green-700/30 text-green-400 bg-green-500/10' : 'border-dark-600 text-slate-500'}`}>
                    {g.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => deleteGrade(g)} className="text-slate-500 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
        }

        {/* Add grade inline */}
        {adding && (
          <div className="bg-dark-800 border border-primary-700/40 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-primary-400">New Grade</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-slate-400 mb-1">Grade Name *</p>
                <input className={inp} value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. 10mm" autoFocus />
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Description</p>
                <input className={inp} value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setAdding(false); setNewName(''); setNewDesc('') }} className="flex-1 btn-ghost text-xs">Cancel</button>
              <button onClick={addGrade} disabled={saving} className="flex-1 btn-primary text-xs flex items-center justify-center gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'today',   label: 'Today',      Icon: Factory    },
  { key: 'ops',     label: 'Daily Ops',  Icon: Clipboard  },
  { key: 'history', label: 'History',    Icon: BarChart3  },
  { key: 'grades',  label: 'Grades',     Icon: Layers     },
]

export default function ProductionTrackerPage() {
  const { companyId, session, role } = useAuth()
  const [activeTab, setActiveTab] = useState('today')
  const isAdmin = ['admin', 'superadmin', 'manager'].includes(role)

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-4 pt-4 pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-700/30 flex items-center justify-center">
            <Factory className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-100">Production Tracker</h1>
            <p className="text-xs text-slate-500">Daily output log by machine and grade</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-dark-700">
          {TABS.filter(t => t.key !== 'grades' || isAdmin).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all -mb-px ${
                activeTab === key
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'today'   && <TodayTab    companyId={companyId} session={session} isAdmin={isAdmin} />}
        {activeTab === 'ops'     && <DailyOpsTab companyId={companyId} session={session} isAdmin={isAdmin} />}
        {activeTab === 'history' && <HistoryTab  companyId={companyId} session={session} isAdmin={isAdmin} />}
        {activeTab === 'grades'  && isAdmin && <GradesTab companyId={companyId} />}
      </div>
    </div>
  )
}
