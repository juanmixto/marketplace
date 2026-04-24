'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ForwardIcon,
  MapPinIcon,
  PauseIcon,
  PlayIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import {
  cancelSubscription,
  listMySubscriptions,
  pauseSubscription,
  rescheduleNextDelivery,
  resumeSubscription,
  skipNextDelivery,
} from '@/domains/subscriptions/buyer-actions'
import type { TranslationKeys } from '@/i18n/locales'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { PauseDuration } from '@/domains/subscriptions/buyer-actions'
import { PauseSubscriptionDialog } from '@/components/subscriptions/PauseSubscriptionDialog'

type Subscription = Awaited<ReturnType<typeof listMySubscriptions>>[number]

interface Props {
  subscriptions: Subscription[]
  welcomeState?: 'success' | 'error' | null
}

export function BuyerSubscriptionsListClient({
  subscriptions,
  welcomeState = null,
}: Props) {
  const t = useT()

  const active = subscriptions.filter(s => s.status !== 'CANCELED')
  const canceled = subscriptions.filter(s => s.status === 'CANCELED')

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {t('account.subscriptions.title')}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t('account.subscriptions.subtitle')}
        </p>
      </div>

      {welcomeState === 'success' && (
        <div
          role="status"
          data-testid="subscription-welcome-banner"
          className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30"
        >
          <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div className="text-sm text-emerald-900 dark:text-emerald-200">
            <p className="font-semibold">{t('account.subscriptions.welcomeSuccessTitle')}</p>
            <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
              {t('account.subscriptions.welcomeSuccessBody')}
            </p>
          </div>
        </div>
      )}
      {welcomeState === 'error' && (
        <div
          role="alert"
          data-testid="subscription-welcome-error"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold">{t('account.subscriptions.welcomeErrorTitle')}</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              {t('account.subscriptions.welcomeErrorBody')}
            </p>
          </div>
        </div>
      )}

      {subscriptions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
                {t('account.subscriptions.sectionActive')}
              </h2>
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                <div className="divide-y divide-[var(--border)]">
                  {active.map(sub => (
                    <SubscriptionRow key={sub.id} subscription={sub} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {canceled.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
                {t('account.subscriptions.sectionCanceled')}
              </h2>
              <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm opacity-80">
                <div className="divide-y divide-[var(--border)]">
                  {canceled.map(sub => (
                    <SubscriptionRow key={sub.id} subscription={sub} />
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState() {
  const t = useT()
  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
      <ArrowPathIcon className="mx-auto h-10 w-10 text-[var(--muted)]" />
      <p className="mt-3 text-[var(--muted)]">{t('account.subscriptions.empty')}</p>
      <Link
        href="/productos"
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
      >
        {t('account.subscriptions.browseCatalog')}
      </Link>
    </div>
  )
}

function SubscriptionRow({ subscription }: { subscription: Subscription }) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false)
  const [rescheduleValue, setRescheduleValue] = useState<string>(() =>
    toYmd(new Date(subscription.nextDeliveryAt)),
  )

  const product = subscription.plan.product
  const vendor = subscription.plan.vendor
  const image = product.images?.[0]

  const statusVariant: BadgeVariant =
    subscription.status === 'ACTIVE'   ? 'green'   :
    subscription.status === 'PAUSED'   ? 'amber'   :
    subscription.status === 'PAST_DUE' ? 'red'     :
    'default'

  const statusKey: TranslationKeys =
    subscription.status === 'ACTIVE'   ? 'account.subscriptions.statusActive'   :
    subscription.status === 'PAUSED'   ? 'account.subscriptions.statusPaused'   :
    subscription.status === 'PAST_DUE' ? 'account.subscriptions.statusPastDue'  :
    'account.subscriptions.statusCanceled'

  const cadenceKey: TranslationKeys =
    subscription.plan.cadence === 'WEEKLY'   ? 'account.subscriptions.cadenceWeekly'   :
    subscription.plan.cadence === 'BIWEEKLY' ? 'account.subscriptions.cadenceBiweekly' :
    'account.subscriptions.cadenceMonthly'

  function runAction(action: () => Promise<unknown>) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('account.subscriptions.errorGeneric'))
      }
    })
  }

  const isActive = subscription.status === 'ACTIVE'
  const isPaused = subscription.status === 'PAUSED'
  const isCanceled = subscription.status === 'CANCELED'

  const rescheduleMin = toYmd(offsetDays(new Date(), 2))
  const rescheduleMax = toYmd(offsetDays(new Date(), 60))

  function submitReschedule() {
    setRescheduleOpen(false)
    runAction(() =>
      rescheduleNextDelivery({
        subscriptionId: subscription.id,
        nextDeliveryAt: rescheduleValue,
      }),
    )
  }

  return (
    <div className="p-4" data-testid={`subscription-row-${product.slug}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
          {image ? (
            <Image src={image} alt={product.name} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl">🧺</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--foreground)] truncate">{product.name}</p>
            <Badge variant={statusVariant}>{t(statusKey)}</Badge>
            <Badge variant="blue">{t(cadenceKey)}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {vendor.displayName} · {formatPrice(Number(subscription.plan.priceSnapshot))} / {product.unit}
          </p>
          {!isCanceled && (
            <p
              className="mt-0.5 text-xs text-[var(--muted)]"
              data-testid="subscription-next-delivery"
            >
              {t('account.subscriptions.nextDeliveryLabel').replace(
                '{date}',
                formatDate(subscription.nextDeliveryAt)
              )}
              {isActive && (() => {
                const days = daysUntil(subscription.nextDeliveryAt)
                if (days <= 0) return null
                return (
                  <span className="ml-1 text-[var(--muted)]">
                    · {t('account.subscriptions.daysUntilLabel').replace('{days}', String(days))}
                  </span>
                )
              })()}
            </p>
          )}
          {!isCanceled && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]">
              <MapPinIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {subscription.shippingAddress.line1}
                {subscription.shippingAddress.line2 ? `, ${subscription.shippingAddress.line2}` : ''}
                {' · '}
                {subscription.shippingAddress.postalCode} {subscription.shippingAddress.city}
              </span>
            </p>
          )}
          {isPaused && subscription.pausedUntil && (
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              {t('account.subscriptions.pausedUntilLabel').replace(
                '{date}',
                formatDate(subscription.pausedUntil),
              )}
            </p>
          )}
          {isPaused && !subscription.pausedUntil && (
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              {t('account.subscriptions.pausedIndefinitely')}
            </p>
          )}
          {isCanceled && subscription.canceledAt && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {t('account.subscriptions.canceledOnLabel').replace(
                '{date}',
                formatDate(subscription.canceledAt)
              )}
            </p>
          )}
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isActive && (
            <>
              <button
                type="button"
                onClick={() => {
                  setRescheduleValue(toYmd(new Date(subscription.nextDeliveryAt)))
                  setRescheduleOpen(true)
                }}
                disabled={pending}
                data-testid="reschedule-subscription-cta"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] min-h-11 px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                <CalendarDaysIcon className="h-4 w-4" />
                {t('account.subscriptions.rescheduleNext')}
              </button>
              <button
                type="button"
                onClick={() => runAction(() => skipNextDelivery(subscription.id))}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] min-h-11 px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                <ForwardIcon className="h-4 w-4" />
                {t('account.subscriptions.skipNext')}
              </button>
              <button
                type="button"
                onClick={() => setPauseDialogOpen(true)}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 min-h-11 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                <PauseIcon className="h-4 w-4" />
                {t('account.subscriptions.pause')}
              </button>
            </>
          )}
          {isPaused && (
            <button
              type="button"
              onClick={() => runAction(() => resumeSubscription(subscription.id))}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 min-h-11 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <PlayIcon className="h-4 w-4" />
              {t('account.subscriptions.resume')}
            </button>
          )}
          {!isCanceled && (
              <button
                type="button"
                onClick={() => runAction(() => cancelSubscription(subscription.id))}
                disabled={pending}
                data-testid={`subscription-cancel-${product.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 min-h-11 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
              >
              <XCircleIcon className="h-4 w-4" />
              {t('account.subscriptions.cancel')}
            </button>
          )}
        </div>
      </div>

      {rescheduleOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`reschedule-${subscription.id}-title`}
          data-testid="reschedule-subscription-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setRescheduleOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-xl">
            <h3
              id={`reschedule-${subscription.id}-title`}
              className="text-base font-semibold text-[var(--foreground)]"
            >
              {t('account.subscriptions.rescheduleDialogTitle')}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {t('account.subscriptions.rescheduleDialogHelp')}
            </p>
            <input
              type="date"
              value={rescheduleValue}
              min={rescheduleMin}
              max={rescheduleMax}
              onChange={e => setRescheduleValue(e.target.value)}
              data-testid="reschedule-subscription-date"
              className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRescheduleOpen(false)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]"
              >
                {t('account.subscriptions.rescheduleCancel')}
              </button>
              <button
                type="button"
                onClick={submitReschedule}
                data-testid="reschedule-subscription-save"
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
              >
                {t('account.subscriptions.rescheduleSave')}
              </button>
            </div>
          </div>
        </div>
      )}

      <PauseSubscriptionDialog
        open={pauseDialogOpen}
        onClose={() => setPauseDialogOpen(false)}
        onConfirm={(duration: PauseDuration) => {
          setPauseDialogOpen(false)
          runAction(() => pauseSubscription(subscription.id, duration))
        }}
        pending={pending}
      />
    </div>
  )
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value))
}

function offsetDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysUntil(value: Date | string): number {
  const target = new Date(value).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)))
}
