'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useT } from '@/i18n'
import {
  generateMyTelegramLinkUrl,
  disconnectTelegram,
  getMyTelegramLinkStatus,
} from '@/domains/notifications/telegram/link-actions'
import type { TelegramLinkSummary } from '@/domains/notifications/telegram/queries'

export function BuyerTelegramConnectPanel({
  initialLink,
  botUsername,
  initialLinkUrl,
}: {
  initialLink: TelegramLinkSummary
  botUsername: string
  initialLinkUrl: string | null
}) {
  const t = useT()
  const [link, setLink] = useState(initialLink)
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [waitingForLink, setWaitingForLink] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const next = await getMyTelegramLinkStatus()
      setLink(next)
      if (next.linked) setWaitingForLink(false)
    } catch {
      // ignore transient errors; next tick will retry
    }
  }, [])

  useEffect(() => {
    if (!waitingForLink) return
    const interval = window.setInterval(() => {
      void refreshStatus()
    }, 3000)
    const onFocus = () => void refreshStatus()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [waitingForLink, refreshStatus])

  function handleConnectClick() {
    setError(null)
    setWaitingForLink(true)
  }

  function handleRegenerate() {
    setError(null)
    startTransition(async () => {
      try {
        const url = await generateMyTelegramLinkUrl()
        setLinkUrl(url)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('account.telegram.linkError'))
      }
    })
  }

  function handleDisconnect() {
    setError(null)
    startTransition(async () => {
      try {
        await disconnectTelegram()
        setLink({ linked: false, username: null, linkedAt: null })
        setWaitingForLink(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('account.telegram.disconnectError'))
      }
    })
  }

  if (link.linked) {
    const label = link.username
      ? t('account.telegram.connectedAs').replace('{username}', link.username)
      : t('account.telegram.connected')
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-[var(--foreground)]">{label}</span>
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={pending}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {pending ? t('account.telegram.disconnecting') : t('account.telegram.disconnect')}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        {t('account.telegram.connectHint').replace('{bot}', botUsername)}
      </p>
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleConnectClick}
          className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
        >
          {t('account.telegram.connect')}
        </a>
      ) : (
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? t('account.telegram.connecting') : t('account.telegram.connect')}
        </button>
      )}
      {waitingForLink && (
        <p className="text-sm text-[var(--muted)]">{t('account.telegram.waitingForLink')}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
