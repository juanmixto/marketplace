'use client'

import { useState, useTransition } from 'react'
import { useT, type TranslationKeys } from '@/i18n'
import { setPreference, type PreferenceRow, type NotificationEventType } from '@/domains/notifications'

const EVENT_LABEL_KEYS: Record<NotificationEventType, TranslationKeys> = {
  ORDER_CREATED: 'vendor.notifications.event.ORDER_CREATED',
  ORDER_PENDING: 'vendor.notifications.event.ORDER_PENDING',
  MESSAGE_RECEIVED: 'vendor.notifications.event.MESSAGE_RECEIVED',
}

export function NotificationPreferencesForm({
  preferences,
  telegramLinked,
}: {
  preferences: PreferenceRow[]
  telegramLinked: boolean
}) {
  const t = useT()
  const [rows, setRows] = useState(preferences)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle(index: number, next: boolean) {
    const row = rows[index]
    if (!row) return
    const optimistic = rows.map((r, i) => (i === index ? { ...r, enabled: next } : r))
    setRows(optimistic)
    setError(null)

    startTransition(async () => {
      try {
        await setPreference({ channel: row.channel, eventType: row.eventType, enabled: next })
      } catch (err) {
        setRows(preferences)
        setError(err instanceof Error ? err.message : t('vendor.notifications.saveError'))
      }
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      {!telegramLinked && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t('vendor.notifications.needsLink')}
        </p>
      )}
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((row, index) => (
          <li key={`${row.channel}-${row.eventType}`} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-[var(--foreground)]">{t(EVENT_LABEL_KEYS[row.eventType])}</p>
              <p className="text-xs text-[var(--muted)]">{row.channel}</p>
            </div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={e => handleToggle(index, e.target.checked)}
                disabled={pending || !telegramLinked}
                className="h-4 w-4 accent-emerald-600 disabled:opacity-50"
              />
              <span className="text-sm text-[var(--foreground)]">
                {row.enabled ? t('vendor.notifications.enabled') : t('vendor.notifications.disabled')}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
