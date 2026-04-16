'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
  UsersIcon,
  MapPinIcon,
  CalendarDaysIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import {
  pauseSubscriptionAsVendor,
  resumeSubscriptionAsVendor,
  skipNextDeliveryAsVendor,
  type listMySubscribers,
  type listMySubscriptionPlans,
} from '@/domains/subscriptions/actions'

type Subscriber = Awaited<ReturnType<typeof listMySubscribers>>[number]
type Plan = Awaited<ReturnType<typeof listMySubscriptionPlans>>[number]

interface Props {
  subscribers: Subscriber[]
  plans: Plan[]
  activePlanId: string | null
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function formatFullDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(d)
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export function VendorSubscribersListClient({ subscribers, plans, activePlanId }: Props) {
  const t = useT()

  const activePlan = useMemo(
    () => (activePlanId ? plans.find(p => p.id === activePlanId) ?? null : null),
    [plans, activePlanId],
  )

  const cadenceLabel = (cadence: Plan['cadence']): string =>
    cadence === 'WEEKLY'
      ? t('vendor.subscriptionPlans.cadenceWeekly')
      : cadence === 'BIWEEKLY'
        ? t('vendor.subscriptionPlans.cadenceBiweekly')
        : t('vendor.subscriptionPlans.cadenceMonthly')

  const statusVariant = (status: Subscriber['status']): 'green' | 'amber' | 'red' | 'default' =>
    status === 'ACTIVE'
      ? 'green'
      : status === 'PAUSED'
        ? 'amber'
        : status === 'PAST_DUE'
          ? 'red'
          : 'default'

  const statusLabel = (status: Subscriber['status']): string =>
    status === 'ACTIVE'
      ? t('vendor.subscribers.statusActive')
      : status === 'PAUSED'
        ? t('vendor.subscribers.statusPaused')
        : status === 'PAST_DUE'
          ? t('vendor.subscribers.statusPastDue')
          : t('vendor.subscribers.statusCanceled')

  // Group subscribers by next-delivery day so vendors can see, at a
  // glance, which orders they need to pack together. This is the most
  // common vendor mental model: "what am I shipping on Friday?"
  const groups = useMemo(() => {
    const byDay = new Map<string, { label: Date; items: Subscriber[] }>()
    for (const sub of subscribers) {
      const date = toDate(sub.nextDeliveryAt)
      const key = date.toISOString().slice(0, 10)
      const existing = byDay.get(key)
      if (existing) {
        existing.items.push(sub)
      } else {
        byDay.set(key, { label: date, items: [sub] })
      }
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, ...value }))
  }, [subscribers])

  const activeCount = subscribers.filter(s => s.status === 'ACTIVE').length

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <Link
          href="/vendor/suscripciones"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          {t('vendor.subscribers.backToPlans')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-[var(--foreground)]">
          {t('vendor.subscribers.title')}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {activePlan
            ? t('vendor.subscribers.filteredSubtitle')
                .replace('{count}', String(subscribers.length))
                .replace('{product}', activePlan.product.name)
            : subscribers.length === 1
              ? t('vendor.subscribers.countOne')
              : t('vendor.subscribers.countOther').replace('{count}', String(subscribers.length))}
        </p>
      </div>

      {/* Plan filter pills — lets the vendor pivot between "all" and a
          specific plan without going back to the dashboard */}
      {plans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/vendor/suscripciones/suscriptores"
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              !activePlanId
                ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
            }`}
          >
            {t('vendor.subscribers.filterAll')}
          </Link>
          {plans.map(plan => (
            <Link
              key={plan.id}
              href={`/vendor/suscripciones/suscriptores?plan=${plan.id}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activePlanId === plan.id
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
              }`}
            >
              {plan.product.name} · {cadenceLabel(plan.cadence)}
            </Link>
          ))}
        </div>
      )}

      {subscribers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
          <UsersIcon className="mx-auto h-10 w-10 text-[var(--muted)]" />
          <p className="mt-3 text-[var(--muted)]">{t('vendor.subscribers.empty')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <UsersIcon className="h-4 w-4" />
              {t('vendor.subscribers.activeCount').replace('{count}', String(activeCount))}
            </div>
          </div>

          {groups.map(group => (
            <section key={group.key} className="space-y-2">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                <CalendarDaysIcon className="h-4 w-4" />
                {formatFullDate(group.label)} · {group.items.length}{' '}
                {group.items.length === 1
                  ? t('vendor.subscribers.deliveryOne')
                  : t('vendor.subscribers.deliveryOther')}
              </h2>
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                <div className="divide-y divide-[var(--border)]">
                  {group.items.map(sub => (
                    <SubscriberRow
                      key={sub.id}
                      subscriber={sub}
                      statusVariant={statusVariant(sub.status)}
                      statusLabel={statusLabel(sub.status)}
                      cadenceLabel={cadenceLabel(sub.plan.cadence)}
                    />
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function SubscriberRow({
  subscriber,
  statusVariant,
  statusLabel,
  cadenceLabel,
}: {
  subscriber: Subscriber
  statusVariant: 'green' | 'amber' | 'red' | 'default'
  statusLabel: string
  cadenceLabel: string
}) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const addr = subscriber.shippingAddress
  const buyer = subscriber.buyer

  const isActive = subscriber.status === 'ACTIVE'
  const isPaused = subscriber.status === 'PAUSED'

  function runAction(action: () => Promise<unknown>) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.subscribers.errorGeneric'))
      }
    })
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {initials(buyer.firstName, buyer.lastName)}
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--foreground)]">
              {buyer.firstName} {buyer.lastName}
            </p>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
            <Badge variant="blue">{cadenceLabel}</Badge>
          </div>
          <p className="text-sm text-[var(--foreground-soft)]">
            {subscriber.plan.product.name} ·{' '}
            {formatPrice(subscriber.plan.priceSnapshot)} / {subscriber.plan.product.unit}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="h-3.5 w-3.5" />
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ''} · {addr.postalCode} {addr.city}
            </span>
            <a
              href={`mailto:${buyer.email}`}
              className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
            >
              <EnvelopeIcon className="h-3.5 w-3.5" />
              {buyer.email}
            </a>
            {addr.phone && (
              <a
                href={`tel:${addr.phone}`}
                className="inline-flex items-center gap-1 hover:text-[var(--foreground)]"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                {addr.phone}
              </a>
            )}
          </div>
          {subscriber.status === 'PAUSED' && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('vendor.subscribers.pausedHint')}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isActive && (
            <>
              <button
                type="button"
                onClick={() => runAction(() => skipNextDeliveryAsVendor(subscriber.id))}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                <ForwardIcon className="h-4 w-4" />
                {t('vendor.subscribers.skipNext')}
              </button>
              <button
                type="button"
                onClick={() => runAction(() => pauseSubscriptionAsVendor(subscriber.id))}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                <PauseIcon className="h-4 w-4" />
                {t('vendor.subscribers.pause')}
              </button>
            </>
          )}
          {isPaused && (
            <button
              type="button"
              onClick={() => runAction(() => resumeSubscriptionAsVendor(subscriber.id))}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <PlayIcon className="h-4 w-4" />
              {t('vendor.subscribers.resume')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
