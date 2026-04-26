'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import {
  getPushSubscriptionState,
  requestPushSubscription,
  unsubscribePushBrowser,
} from '@/lib/pwa/push-client'
import { subscribeToPush, unsubscribeFromPush } from '@/domains/push-notifications/actions'
import { trackPwaEvent } from '@/lib/pwa/track'

type PushState = 'loading' | 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'unsubscribed'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const iosNav = navigator as Navigator & { standalone?: boolean }
  return iosNav.standalone === true
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
}

export function WebPushConnectPanel() {
  const t = useT()
  const [state, setState] = useState<PushState>('loading')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setStandalone(isStandalone())
    getPushSubscriptionState().then(setState)

    const stashed =
      (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent })
        .__pwaInstallPrompt ?? null
    if (stashed) setInstallEvent(stashed)

    const onInstallable = () => {
      const event =
        (window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent })
          .__pwaInstallPrompt ?? null
      if (event) setInstallEvent(event)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setStandalone(true)
      // Re-check push state — once installed the SW lifecycle differs on iOS.
      getPushSubscriptionState().then(setState)
    }
    window.addEventListener('pwa:installable', onInstallable)
    window.addEventListener('pwa:installed', onInstalled)
    return () => {
      window.removeEventListener('pwa:installable', onInstallable)
      window.removeEventListener('pwa:installed', onInstalled)
    }
  }, [])

  function handleEnable() {
    setError(null)
    startTransition(async () => {
      try {
        const keys = await requestPushSubscription()
        if (!keys) {
          const next = await getPushSubscriptionState()
          setState(next)
          if (next === 'denied') setError(t('vendor.webpush.permissionDenied'))
          return
        }
        await subscribeToPush(keys)
        setState('subscribed')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.webpush.enableError'))
      }
    })
  }

  function handleDisable() {
    setError(null)
    startTransition(async () => {
      try {
        const endpoint = await unsubscribePushBrowser()
        if (endpoint) await unsubscribeFromPush(endpoint)
        setState('unsubscribed')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.webpush.disableError'))
      }
    })
  }

  async function handleInstall() {
    if (!installEvent) return
    try {
      trackPwaEvent('pwa_install_prompted')
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === 'accepted') {
        trackPwaEvent('pwa_install_accepted')
      } else {
        trackPwaEvent('pwa_install_dismissed')
      }
    } catch {
      // prompt() throws if called twice — fall through.
    } finally {
      setInstallEvent(null)
      ;(window as unknown as { __pwaInstallPrompt?: BeforeInstallPromptEvent })
        .__pwaInstallPrompt = undefined
    }
  }

  if (state === 'loading') {
    return <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.checking')}</p>
  }

  // iOS only allows web push when the site is installed to home screen.
  // If the user is on iOS Safari and not in standalone, push will never
  // work no matter what we do — point them at install instructions.
  if (isIos() && !standalone) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          <span className="font-medium text-[var(--foreground)]">{t('vendor.webpush.iosNeedsInstall')}</span>
        </div>
        <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.iosInstallHint')}</p>
      </div>
    )
  }

  if (state === 'unsupported') {
    // On Chromium/Edge/Android we can offer install. The SW + push only
    // wakes up reliably once the PWA is installed, so promote that path.
    if (installEvent) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.installHint')}</p>
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
            {t('vendor.webpush.install')}
          </button>
        </div>
      )
    }
    return <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.unsupported')}</p>
  }

  if (state === 'denied') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          <span className="font-medium text-[var(--foreground)]">{t('vendor.webpush.denied')}</span>
        </div>
        <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.deniedHint')}</p>
      </div>
    )
  }

  if (state === 'subscribed') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-[var(--foreground)]">{t('vendor.webpush.subscribed')}</span>
        </div>
        <button
          type="button"
          onClick={handleDisable}
          disabled={pending}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {pending ? t('vendor.webpush.disabling') : t('vendor.webpush.disable')}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.enableHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleEnable}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? t('vendor.webpush.enabling') : t('vendor.webpush.enable')}
        </button>
        {installEvent && !standalone && (
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
          >
            <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
            {t('vendor.webpush.install')}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
