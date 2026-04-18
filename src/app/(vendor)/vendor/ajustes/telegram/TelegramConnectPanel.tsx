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
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function copyToClipboard(url: string): Promise<boolean> {
    if (!navigator.clipboard?.writeText) {
      return Promise.resolve(false)
    }
    return navigator.clipboard.writeText(url).then(() => true).catch(() => false)
  }

  function handleConnect() {
    setError(null)
    setCopied(false)
    startTransition(async () => {
      try {
        const url = await generateMyTelegramLinkUrl()
        setGeneratedLink(url)
        setCopied(await copyToClipboard(url))
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
        setGeneratedLink(null)
        setCopied(false)
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
        {link.linkedAt && (
          <p className="text-sm text-[var(--muted)]">
            {t('vendor.telegram.connectedSince').replace(
              '{date}',
              new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(link.linkedAt)),
            )}
          </p>
        )}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--foreground-soft)]">
          <p className="font-medium text-[var(--foreground)]">{t('vendor.telegram.statusTitle')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{t('vendor.telegram.statusBulletOrders')}</li>
            <li>{t('vendor.telegram.statusBulletPreferences')}</li>
            <li>{t('vendor.telegram.statusBulletDisconnect')}</li>
          </ul>
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
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <p className="text-sm text-[var(--muted)]">
          {t('vendor.telegram.connectHint').replace('{bot}', botUsername)}
        </p>
        <ol className="mt-3 space-y-1 text-sm text-[var(--foreground-soft)]">
          <li>{t('vendor.telegram.step1')}</li>
          <li>{t('vendor.telegram.step2')}</li>
          <li>{t('vendor.telegram.step3')}</li>
        </ol>
        <p className="mt-3 text-xs text-[var(--muted)]">{t('vendor.telegram.linkExpires')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleConnect}
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? t('vendor.telegram.connecting') : t('vendor.telegram.connect')}
        </button>
        {generatedLink && (
          <button
            type="button"
            onClick={async () => {
              setCopied(await copyToClipboard(generatedLink))
            }}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
          >
            {copied ? t('vendor.telegram.copied') : t('vendor.telegram.copyLink')}
          </button>
        )}
      </div>
      {generatedLink && (
        <p className="break-all rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
          {generatedLink}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
