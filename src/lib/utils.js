import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import { PERMISSIONS } from './constants'

// ─── Date helpers ─────────────────────────────────────────────────────────────
export const fmtDate    = (d) => d && isValid(new Date(d)) ? format(new Date(d), 'dd MMM yyyy') : '—'
export const fmtDateISO = (d) => d && isValid(new Date(d)) ? format(new Date(d), 'yyyy-MM-dd') : ''
export const fmtTime    = (d) => d && isValid(new Date(d)) ? format(new Date(d), 'hh:mm a') : '—'
export const fmtDateTime= (d) => d && isValid(new Date(d)) ? format(new Date(d), 'dd MMM yyyy, hh:mm a') : '—'
export const timeAgo    = (d) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : '—'

// ─── Number helpers ───────────────────────────────────────────────────────────
export const fmtCurrency = (n, symbol = '₹') =>
  n != null ? `${symbol}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

export const fmtNumber = (n, decimals = 0) =>
  n != null ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—'

// ─── String helpers ───────────────────────────────────────────────────────────
export const initials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

export const truncate = (str, len = 40) =>
  str && str.length > len ? str.slice(0, len) + '…' : str || '—'

export const capitalize = (str = '') =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()

// ─── Permission helper ────────────────────────────────────────────────────────
export const can = (userRole, permission) => {
  if (!PERMISSIONS[permission]) return false
  return PERMISSIONS[permission].includes(userRole)
}

// ─── ID generator ─────────────────────────────────────────────────────────────
export const genCode = (prefix, number) =>
  `${prefix}-${String(number).padStart(4, '0')}`

// ─── Class name helper ────────────────────────────────────────────────────────
export const cn = (...classes) => classes.filter(Boolean).join(' ')

// ─── Days until date ─────────────────────────────────────────────────────────
export const daysUntil = (dateStr) => {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ─── Status color helper ──────────────────────────────────────────────────────
export const expiryBadge = (dateStr) => {
  const days = daysUntil(dateStr)
  if (days === null) return 'badge-neutral'
  if (days < 0)   return 'badge-danger'
  if (days <= 30) return 'badge-warning'
  return 'badge-success'
}
