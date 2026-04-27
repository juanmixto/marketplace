'use client'

import { cn } from '@/lib/utils'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useId, useRef } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' }

export function Modal({ open, onClose, title, children, size = 'md', className }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  // Keep `onClose` in a ref so the open/close effect below can read the latest
  // callback without listing it as a dep. Including `onClose` in the deps was
  // the cause of a real bug: parents pass `() => setOpen(false)` inline, so
  // each parent re-render minted a new function identity, the effect re-ran,
  // and the setTimeout below pulled focus back to the first focusable element
  // on every keystroke inside child <textarea>/<input> elements. The user saw
  // the focus ring jumping to the close X while typing a review comment.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
      }
    }

    document.addEventListener('keydown', onKey)
    const frame = window.setTimeout(() => {
      const dialog = dialogRef.current
      if (!dialog) return

      // Prefer the first editable field — the user is here to fill content,
      // not to dismiss. Falls back to the first focusable (or the dialog
      // itself) when there is nothing to type into.
      const editable = dialog.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])'
      )
      if (editable) {
        editable.focus()
        return
      }

      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length > 0) {
        focusables[0]!.focus()
      } else {
        dialog.focus()
      }
    }, 0)

    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(frame)
      body.style.overflow = previousOverflow
    }
  }, [open])

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )

    if (focusables.length === 0) {
      event.preventDefault()
      return
    }

    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    const active = document.activeElement as HTMLElement | null

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Diálogo'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className={cn(
          'max-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/30',
          'ring-1 ring-black/5 dark:ring-white/10',
          SIZES[size],
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 id={titleId} className="font-semibold text-[var(--foreground)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar modal"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2.5 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
