'use client'

import { useEffect, useState, useTransition } from 'react'
import { useT } from '@/i18n'
import {
  getPushSubscriptionState,
  requestPushSubscription,
  unsubscribePushBrowser,
} from '@/lib/pwa/push-client'
import { subscribeToPush, unsubscribeFromPush } from '@/domains/push-notifications/actions'

type PushState = 'loading' | 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'unsubscribed'

export function WebPushConnectPanel() {
  const t = useT()
  const [state, setState] = useState<PushState>('loading')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPushSubscriptionState().then(setState)
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

  if (state === 'loading') {
    return <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.checking')}</p>
  }

  if (state === 'unsupported') {
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
      <button
        type="button"
        onClick={handleEnable}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? t('vendor.webpush.enabling') : t('vendor.webpush.enable')}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
