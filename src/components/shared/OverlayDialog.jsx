import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function OverlayDialog({ label, onClose, className, children }) {
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement
    const panel = panelRef.current
    panel?.querySelector('button, input, select, textarea')?.focus()
    const handleKey = event => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== panel) return
      if (event.key === 'Escape') closeRef.current?.()
      if (event.key !== 'Tab') return
      const controls = [...panel.querySelectorAll('button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], [tabindex="0"]')]
        .filter(element => element.offsetParent !== null)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) event.preventDefault()
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus?.() }
  }, [])
  return createPortal(<div ref={panelRef} role="dialog" aria-modal="true" aria-label={label} className={className}>{children}</div>, document.body)
}

