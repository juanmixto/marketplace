'use client'

import { useState, useTransition } from 'react'
import { useT } from '@/i18n'
import { generateMyTelegramLinkUrl, disconnectTelegram } from '@/domains/notifications/telegram/link-actions'
import type { TelegramLinkSummary } from '@/domains/notifications/telegram/queries'

export function TelegramConnectPanel({
  initialLink,
  botUsername,
}: {
  initialLink: TelegramLinkSummary
  botUsername: string
}) {
  const t = useT()
  const [link, setLink] = useState(initialLink)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConnect() {
    setError(null)
    startTransition(async () => {
      try {
        const url = await generateMyTelegramLinkUrl()
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.telegram.linkError'))
      }
    })
  }

  function handleDisconnect() {
    setError(null)
    startTransition(async () => {
      try {
        await disconnectTelegram()
        setLink({ linked: false, username: null, linkedAt: null })
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.telegram.disconnectError'))
      }
    })
  }

  if (link.linked) {
    const label = link.username
      ? t('vendor.telegram.connectedAs').replace('{username}', link.username)
      : t('vendor.telegram.connected')
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
          {pending ? t('vendor.telegram.disconnecting') : t('vendor.telegram.disconnect')}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        {t('vendor.telegram.connectHint').replace('{bot}', botUsername)}
      </p>
      <button
        type="button"
        onClick={handleConnect}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? t('vendor.telegram.connecting') : t('vendor.telegram.connect')}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
