'use client'

import { useEffect, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

const DISMISS_KEY = 'mp.pwa.iosHint.dismissedAt'
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
const REVEAL_DELAY_MS = 3000

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua)
  // Android Chrome on iPad identifies as iPad too — check Safari presence.
  const isSafariFamily = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua)
  return isIos && isSafariFamily
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const iosNav = navigator as Navigator & { standalone?: boolean }
  return iosNav.standalone === true
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number.parseInt(raw, 10)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

/**
 * iOS Safari doesn't fire `beforeinstallprompt`, so the regular
 * `<InstallButton />` never appears on iPhones. Instead we show a small
 * dismissible banner pointing the user at the native Share → "Add to Home
 * Screen" flow. Surfaces only on public/buyer routes; the parent decides
 * when to mount this component.
 */
export default function IosInstallHint() {
  const t = useT()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isIosSafari()) return
    if (isStandalone()) return
    if (recentlyDismissed()) return
    const id = window.setTimeout(() => setVisible(true), REVEAL_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  if (!visible) return null

  const onDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore — private mode
    }
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('pwa.ios.hint.title')}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-emerald-200/70 bg-white/95 p-3 shadow-xl backdrop-blur-sm dark:border-emerald-500/30 dark:bg-neutral-900/95"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        >
          <IosShareGlyph />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-[var(--foreground)]">
            {t('pwa.ios.hint.title')}
          </p>
          <p className="mt-0.5 text-[var(--foreground-soft)]">
            {t('pwa.ios.hint.body')}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('pwa.ios.hint.dismiss')}
          className="flex-none rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function IosShareGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  )
}
