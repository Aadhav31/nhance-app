import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function Modal({ title, onClose, children, footer, size = 'md' }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Keep focus inside the dialog and restore the opening control on close.
  useEffect(() => {
    const previousFocus = document.activeElement
    const dialog = dialogRef.current
    const initialFocus = dialog?.querySelector('input, select, textarea') || dialog?.querySelector('button')
    initialFocus?.focus()
    const handler = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key !== 'Tab' || !dialog) return
      const controls = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(element => element.offsetParent !== null)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { e.preventDefault(); return }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => { document.removeEventListener('keydown', handler); previousFocus?.focus?.() }
  }, [])

  const sizeClass = {
    sm: 'modal-sm',
    md: 'modal-md',
    lg: 'modal-lg',
    xl: 'modal-xl',
  }[size] || 'modal-md'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : 'Dialog'} className={sizeClass} onClick={e => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <h2 id={titleId} className="text-base font-bold text-slate-100">{title}</h2>
            <button type="button" aria-label="Close dialog" onClick={onClose} className="btn-ghost p-1.5 -mr-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function FormField({ label, required, children, hint }) {
  return (
    <div>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
