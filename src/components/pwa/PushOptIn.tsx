'use client'

import { useEffect, useState } from 'react'
import { BellIcon, BellSlashIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import {
  requestPushSubscription,
  getPushSubscriptionState,
  unsubscribePushBrowser,
} from '@/lib/pwa/push-client'
import { subscribeToPush, unsubscribeFromPush } from '@/domains/push-notifications/actions'

type PushState = 'loading' | 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'unsubscribed'

/**
 * Renders a push notification opt-in / opt-out button. Hidden when push
 * is not supported or when VAPID keys are not configured. Safe to mount
 * anywhere — all browser APIs are gated behind feature detection.
 */
export default function PushOptIn() {
  const t = useT()
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushSubscriptionState().then(setState)
  }, [])

  // Don't show anything until we know the state, and hide on unsupported
  // or permission-denied (nothing we can do).
  if (state === 'loading' || state === 'unsupported' || state === 'denied') {
    return null
  }

  const isSubscribed = state === 'subscribed'

  const handleToggle = async () => {
    if (busy) return
    setBusy(true)

    try {
      if (isSubscribed) {
        const endpoint = await unsubscribePushBrowser()
        if (endpoint) await unsubscribeFromPush(endpoint)
        setState('unsubscribed')
      } else {
        const keys = await requestPushSubscription()
        if (!keys) {
          // User denied or browser blocked.
          const newState = await getPushSubscriptionState()
          setState(newState)
          return
        }
        await subscribeToPush(keys)
        setState('subscribed')
      }
    } catch {
      // Swallow — push is nice-to-have, must never break the app.
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={busy}
      title={isSubscribed ? t('pwa.push.disable') : t('pwa.push.enable')}
      aria-label={isSubscribed ? t('pwa.push.disable') : t('pwa.push.enable')}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:opacity-50"
    >
      {isSubscribed ? (
        <BellSlashIcon className="h-4.5 w-4.5" aria-hidden />
      ) : (
        <BellIcon className="h-4.5 w-4.5" aria-hidden />
      )}
      <span className="hidden md:inline">
        {isSubscribed ? t('pwa.push.disable') : t('pwa.push.enable')}
      </span>
    </button>
  )
}
