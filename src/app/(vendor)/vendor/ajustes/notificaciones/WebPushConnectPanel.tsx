'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
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

  const refresh = useCallback(async () => {
    const next = await getPushSubscriptionState()
    setState(next)
  }, [])

  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

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

  const title = t('vendor.webpush.title')

  if (state === 'loading') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--foreground)]">{title}</div>
          <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.checking')}</p>
        </div>
      </div>
    )
  }

  if (state === 'unsupported') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[var(--foreground)]">{title}</div>
          <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.unsupported')}</p>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <span className="font-medium text-[var(--foreground)]">{title}</span>
          <span className="truncate text-sm text-[var(--muted)]">· {t('vendor.webpush.denied')}</span>
        </div>
        <p className="basis-full text-sm text-[var(--muted)]">{t('vendor.webpush.deniedHint')}</p>
      </div>
    )
  }

  if (state === 'subscribed') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="font-medium text-[var(--foreground)]">{title}</span>
          <span className="truncate text-sm text-[var(--muted)]">· {t('vendor.webpush.subscribed')}</span>
        </div>
        <button
          type="button"
          onClick={handleDisable}
          disabled={pending}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {pending ? t('vendor.webpush.disabling') : t('vendor.webpush.disable')}
        </button>
        {error && <p className="basis-full text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium text-[var(--foreground)]">{title}</div>
        <p className="text-sm text-[var(--muted)]">{t('vendor.webpush.enableHint')}</p>
      </div>
      <button
        type="button"
        onClick={handleEnable}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? t('vendor.webpush.enabling') : t('vendor.webpush.enable')}
      </button>
      {error && <p className="basis-full text-sm text-red-600">{error}</p>}
    </div>
  )
}
