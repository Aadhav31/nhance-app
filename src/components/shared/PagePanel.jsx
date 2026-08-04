import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * PagePanel — replaces modals with a full-screen slide-in page.
 *
 * Props:
 *   title     – page heading (string)
 *   subtitle  – optional sub-heading (string)
 *   onClose   – called on back-button / Escape
 *   footer    – ReactNode placed in sticky bottom bar (save/cancel buttons)
 *   actions   – ReactNode placed in the header right side (extra toolbar buttons)
 *   maxWidth  – content max-width class, default 'max-w-4xl'
 *   children  – form / page body
 */
export default function PagePanel({
  title,
  subtitle,
  onClose,
  children,
  footer,
  actions,
  maxWidth = 'max-w-4xl',
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-dark-900 animate-page-in">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-dark-700 bg-dark-800">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="h-4 w-px bg-dark-600 mx-1" />

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-100 truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-400 truncate leading-tight">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className={`${maxWidth} mx-auto w-full px-4 sm:px-6 py-6`}>
          {children}
        </div>
      </div>

      {/* ── Sticky footer ─────────────────────────────────────────────────── */}
      {footer && (
        <div className="shrink-0 border-t border-dark-700 bg-dark-800 px-4 sm:px-6 py-4 flex items-center justify-end gap-3">
          {footer}
        </div>
      )}
    </div>
  )
}
