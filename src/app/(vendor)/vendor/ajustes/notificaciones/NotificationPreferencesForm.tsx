'use client'

import { useState, useTransition } from 'react'
import { useT } from '@/i18n'
import {
  setPreference,
  type PreferenceRow,
  type NotificationEventType,
} from '@/domains/notifications'

interface EventMeta {
  label: string
  description: string
}

interface Group {
  title: string
  events: NotificationEventType[]
}

const EVENT_META: Partial<Record<NotificationEventType, EventMeta>> = {
  ORDER_CREATED:    { label: 'Nuevo pedido',         description: 'Cuando un cliente paga un pedido tuyo.' },
  ORDER_PENDING:    { label: 'Acción requerida',     description: 'Confirmar, generar etiqueta o marcar enviado.' },
  ORDER_DELIVERED:  { label: 'Pedido entregado',     description: 'Cierre del envío al cliente.' },
  LABEL_FAILED:     { label: 'Etiqueta falló',       description: 'Error al generar etiqueta con el transportista.' },
  INCIDENT_OPENED:  { label: 'Incidencia abierta',   description: 'Un cliente ha abierto una disputa.' },
  MESSAGE_RECEIVED: { label: 'Mensaje de cliente',   description: 'Chat nuevo en un pedido.' },
  REVIEW_RECEIVED:  { label: 'Nueva valoración',     description: 'Un cliente ha valorado tu producto.' },
  PAYOUT_PAID:      { label: 'Liquidación pagada',   description: 'Transferencia enviada a tu cuenta.' },
  STOCK_LOW:        { label: 'Stock bajo',           description: 'Un producto llegó a 5 o menos unidades.' },
}

const GROUPS: Group[] = [
  { title: 'Pedidos',      events: ['ORDER_CREATED', 'ORDER_PENDING', 'ORDER_DELIVERED'] },
  { title: 'Incidencias',  events: ['LABEL_FAILED', 'INCIDENT_OPENED', 'MESSAGE_RECEIVED'] },
  { title: 'Negocio',      events: ['REVIEW_RECEIVED', 'PAYOUT_PAID', 'STOCK_LOW'] },
]

// Vendor-side preferences. Telegram is the only surfaced channel — Web
// Push proved unreliable across browsers (Brave blocks FCM by default,
// iOS only works inside an installed PWA, Firefox private fails
// silently). Until Email is wired up as a fallback channel, we hide
// WEB_PUSH from the UI so vendors aren't tricked into thinking they
// have working alerts when they don't. The DB rows still exist; if a
// user previously toggled WEB_PUSH on it stays on, just unconfigurable
// here.
export function NotificationPreferencesForm({
  preferences,
  telegramLinked,
}: {
  preferences: PreferenceRow[]
  telegramLinked: boolean
}) {
  const t = useT()
  const [rows, setRows] = useState(() =>
    preferences.filter(r => r.channel === 'TELEGRAM'),
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const rowByEvent = new Map<NotificationEventType, PreferenceRow>()
  for (const r of rows) rowByEvent.set(r.eventType, r)

  function setEnabled(eventType: NotificationEventType, next: boolean) {
    const row = rowByEvent.get(eventType)
    if (!row) return
    const optimistic = rows.map(r =>
      r.eventType === eventType ? { ...r, enabled: next } : r,
    )
    setRows(optimistic)
    setError(null)

    startTransition(async () => {
      try {
        await setPreference({ channel: 'TELEGRAM', eventType, enabled: next })
      } catch (err) {
        setRows(preferences.filter(r => r.channel === 'TELEGRAM'))
        setError(err instanceof Error ? err.message : t('vendor.notifications.saveError'))
      }
    })
  }

  return (
    <div className="space-y-5">
      {!telegramLinked && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {t('vendor.notifications.needsLink')}
        </p>
      )}

      {GROUPS.map(group => {
        const visible = group.events.filter(ev => EVENT_META[ev])
        if (visible.length === 0) return null
        return (
          <section
            key={group.title}
            className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                {group.title}
              </h3>
            </header>
            <ul className="divide-y divide-[var(--border)]">
              {visible.map(eventType => {
                const meta = EVENT_META[eventType]!
                const row = rowByEvent.get(eventType)
                if (!row) return null
                return (
                  <li
                    key={eventType}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)]">{meta.label}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{meta.description}</p>
                    </div>
                    <Toggle
                      checked={row.enabled}
                      disabled={pending || !telegramLinked}
                      onChange={next => setEnabled(eventType, next)}
                      ariaLabel={meta.label}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
        checked ? 'bg-emerald-600' : 'bg-[var(--surface-raised)] border border-[var(--border)]',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  )
}
