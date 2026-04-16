'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

/**
 * Listens for the `pwa:updateready` event that `<PwaRegister />` emits when
 * a new service worker reaches `installed` with a controlling worker still
 * active. Offers the user an "Update now" action that posts SKIP_WAITING to
 * the waiting worker; the register's `controllerchange` handler then
 * triggers a single reload.
 */
export default function UpdateToast() {
  const t = useT()
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(
    null
  )
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handler = () => {
      const reg =
        (
          window as unknown as {
            __pwaWaitingRegistration?: ServiceWorkerRegistration
          }
        ).__pwaWaitingRegistration ?? null
      if (!reg) return
      setRegistration(reg)
      setDismissed(false)
    }

    window.addEventListener('pwa:updateready', handler)
    return () => window.removeEventListener('pwa:updateready', handler)
  }, [])

  if (!registration || dismissed) return null

  const onUpdate = () => {
    const waiting = registration.waiting
    if (!waiting) {
      // No waiting worker — nothing to do. Hide the toast.
      setDismissed(true)
      return
    }
    waiting.postMessage('SKIP_WAITING')
    // The `controllerchange` listener in PwaRegister will trigger the reload
    // once the new worker takes over. We just hide the toast meanwhile.
    setDismissed(true)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-200/70 bg-white/95 p-3 shadow-xl backdrop-blur-sm dark:border-emerald-500/30 dark:bg-neutral-900/95"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        >
          <ArrowPathIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-[var(--foreground)]">
            {t('pwa.update.title')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onUpdate}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            >
              {t('pwa.update.cta')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('pwa.update.dismiss')}
          className="flex-none rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
