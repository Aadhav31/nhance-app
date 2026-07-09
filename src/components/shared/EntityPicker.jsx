/**
 * EntityPicker — reusable combobox for Client and Vendor fields
 *
 * Exports:
 *   ClientPicker  — searches `clients` table, auto-fills name/gstin/address
 *   VendorPicker  — searches `vendors` table, auto-fills name/gstin
 *
 * Both components allow free-text entry if the entity isn't in the DB.
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// ─── Shared dropdown UI ───────────────────────────────────────────────────────
function Dropdown({ items, onSelect, labelFn, subFn }) {
  if (!items.length) return null
  return (
    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-dark-700 border border-dark-500 rounded-xl shadow-xl max-h-48 overflow-y-auto">
      {items.map((item, i) => (
        <button
          key={item.id || i}
          type="button"
          onMouseDown={e => { e.preventDefault(); onSelect(item) }}
          className="w-full text-left px-3 py-2 hover:bg-dark-600 transition-colors first:rounded-t-xl last:rounded-b-xl"
        >
          <p className="text-xs font-semibold text-slate-200">{labelFn(item)}</p>
          {subFn && subFn(item) && (
            <p className="text-[11px] text-slate-500 truncate">{subFn(item)}</p>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── ClientPicker ─────────────────────────────────────────────────────────────
// Props:
//   companyId   — required
//   value       — current client_name string
//   onChange    — (name: string) => void  — called on every keystroke
//   onSelect    — (client: {name, gstin, address, state}) => void — called on pick
//   placeholder — optional
//   className   — extra classes for the input
export function ClientPicker({ companyId, value, onChange, onSelect, placeholder = 'Type to search clients…', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data: clients = [] } = useQuery({
    queryKey: ['clients_picker', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, display_name, business_name, gstin, registered_address, city, state, pincode')
        .eq('company_id', companyId)
        .order('business_name')
      return data || []
    },
    enabled: !!companyId,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    if (!q) return clients.slice(0, 8)
    return clients.filter(c => {
      const name = (c.display_name || c.business_name || '').toLowerCase()
      const gstin = (c.gstin || '').toLowerCase()
      return name.includes(q) || gstin.includes(q)
    }).slice(0, 8)
  }, [clients, value])

  const handleSelect = (c) => {
    const name = c.display_name || c.business_name || ''
    const addrParts = [c.registered_address, c.city, c.state, c.pincode].filter(Boolean)
    onChange(name)
    onSelect?.({ name, gstin: c.gstin || '', address: addrParts.join(', '), state: c.state || '' })
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <Dropdown
          items={filtered}
          onSelect={handleSelect}
          labelFn={c => c.display_name || c.business_name}
          subFn={c => c.gstin ? `GSTIN: ${c.gstin}` : null}
        />
      )}
    </div>
  )
}

// ─── VendorPicker ─────────────────────────────────────────────────────────────
// Props:
//   companyId   — required
//   value       — current vendor_name string
//   onChange    — (name: string) => void
//   onSelect    — (vendor: {name, gstin}) => void
//   placeholder — optional
//   className   — extra classes
export function VendorPicker({ companyId, value, onChange, onSelect, placeholder = 'Type to search vendors…', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors_picker', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('vendors')
        .select('id, name, gstin, category')
        .eq('company_id', companyId)
        .order('name')
      return data || []
    },
    enabled: !!companyId,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    if (!q) return vendors.slice(0, 8)
    return vendors.filter(v =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.gstin || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [vendors, value])

  const handleSelect = (v) => {
    onChange(v.name)
    onSelect?.({ name: v.name, gstin: v.gstin || '' })
    setOpen(false)
  }

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <Dropdown
          items={filtered}
          onSelect={handleSelect}
          labelFn={v => v.name}
          subFn={v => [v.gstin, v.category].filter(Boolean).join(' · ') || null}
        />
      )}
    </div>
  )
}
