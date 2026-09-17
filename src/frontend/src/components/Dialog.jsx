import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const focusSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'

export default function Dialog({ as: Element = 'section', onClose, children, className = '', ...props }) {
  const wrapperRef = useRef(null)
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    const siblings = [...document.body.children].filter((element) => element !== wrapperRef.current)
    const inertStates = siblings.map((element) => [element, element.inert])
    siblings.forEach((element) => { element.inert = true })
    document.body.style.overflow = 'hidden'
    const focusable = () => [...dialogRef.current.querySelectorAll(focusSelector)]
      .filter((element) => !element.closest('[hidden], [aria-hidden="true"], [inert]'))
    ;(focusable()[0] || dialogRef.current).focus()
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements.at(-1)
      if (!first) { event.preventDefault(); dialogRef.current.focus(); return }
      if (!dialogRef.current.contains(document.activeElement) || document.activeElement === dialogRef.current) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('keydown', handleKey, true)
      inertStates.forEach(([element, state]) => { element.inert = state })
      document.body.style.overflow = overflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  return createPortal(<div ref={wrapperRef} className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
    <Element {...props} ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} className={`max-h-[calc(100dvh-2rem)] overscroll-contain overflow-y-auto outline-none ${className}`}>{children}</Element>
  </div>, document.body)
}
