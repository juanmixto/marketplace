'use client'

import { useEffect, useState } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

/**
 * Minimum Chromium `beforeinstallprompt` event shape — not exported by
 * lib.dom.d.ts, so we redeclare it narrowly here.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'mp.pwa.install.dismissedAt'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

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

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari surfaces standalone mode on navigator, not matchMedia.
  const iosNav = navigator as Navigator & { standalone?: boolean }
  return iosNav.standalone === true
}

export default function InstallButton() {
  const t = useT()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandalone()) return
    if (recentlyDismissed()) return

    // If PwaRegister already captured the event before this component
    // mounted, read it from the stash so we don't miss the single-shot
    // beforeinstallprompt.
    const stashed =
      (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent })
        .__pwaInstallPrompt ?? null
    if (stashed) {
      setPrompt(stashed)
      setVisible(true)
    }

    const onInstallable = () => {
      const event =
        (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent })
          .__pwaInstallPrompt ?? null
      if (!event) return
      setPrompt(event)
      setVisible(true)
    }

    const onInstalled = () => {
      setPrompt(null)
      setVisible(false)
    }

    window.addEventListener('pwa:installable', onInstallable)
    window.addEventListener('pwa:installed', onInstalled)
    return () => {
      window.removeEventListener('pwa:installable', onInstallable)
      window.removeEventListener('pwa:installed', onInstalled)
    }
  }, [])

  if (!visible || !prompt) return null

  const onClick = async () => {
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'dismissed') {
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()))
        } catch {
          // localStorage may be unavailable in private mode — ignore.
        }
      }
    } catch {
      // prompt() can throw if called more than once — fall through.
    } finally {
      // The BeforeInstallPromptEvent is single-use; hide the button either way.
      setVisible(false)
      setPrompt(null)
      ;(window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent })
        .__pwaInstallPrompt = undefined
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={t('pwa.install.tooltip')}
      aria-label={t('pwa.install.cta')}
      className="hidden items-center gap-1.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60 md:inline-flex"
    >
      <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
      <span>{t('pwa.install.cta')}</span>
    </button>
  )
}
