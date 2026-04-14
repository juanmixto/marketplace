'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  ArrowPathIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import {
  archiveSubscriptionPlan,
  unarchiveSubscriptionPlan,
  listMySubscriptionPlans,
} from '@/domains/subscriptions/actions'
import type { TranslationKeys } from '@/i18n/locales'

type Plan = Awaited<ReturnType<typeof listMySubscriptionPlans>>[number]

type FilterKey = 'active' | 'archived' | 'all'

const FILTERS: { key: FilterKey; labelKey: TranslationKeys }[] = [
  { key: 'active',   labelKey: 'vendor.subscriptionPlans.filterActive' },
  { key: 'archived', labelKey: 'vendor.subscriptionPlans.filterArchived' },
  { key: 'all',      labelKey: 'vendor.subscriptionPlans.filterAll' },
]

const DAY_KEYS: TranslationKeys[] = [
  'vendor.subscriptionPlans.day0',
  'vendor.subscriptionPlans.day1',
  'vendor.subscriptionPlans.day2',
  'vendor.subscriptionPlans.day3',
  'vendor.subscriptionPlans.day4',
  'vendor.subscriptionPlans.day5',
  'vendor.subscriptionPlans.day6',
]

interface Props {
  plans: Plan[]
}

export function VendorSubscriptionPlansListClient({ plans }: Props) {
  const t = useT()
  const [filter, setFilter] = useState<FilterKey>('active')

  const filtered = useMemo(() => {
    return plans.filter(plan => {
      if (filter === 'active') return plan.archivedAt === null
      if (filter === 'archived') return plan.archivedAt !== null
      return true
    })
  }, [plans, filter])

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {t('vendor.subscriptionPlans.title')}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {plans.length === 1
              ? t('vendor.subscriptionPlans.countOne')
              : t('vendor.subscriptionPlans.countOther').replace(
                  '{count}',
                  String(plans.length)
                )}
          </p>
        </div>
        <Link
          href="/vendor/suscripciones/nueva"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" />
          {t('vendor.subscriptionPlans.newPlan')}
        </Link>
      </div>

      {/* Dormant notice — set expectations: phase 3 is vendor-only */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
        <InformationCircleIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="text-sm text-blue-900 dark:text-blue-200">
          <p className="font-semibold">{t('vendor.subscriptionPlans.dormantNoticeTitle')}</p>
          <p className="mt-0.5 text-blue-800 dark:text-blue-300">
            {t('vendor.subscriptionPlans.dormantNoticeBody')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-gray-950'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
              }`}
            >
              {t(f.labelKey)}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="divide-y divide-[var(--border)]">
            {filtered.map(plan => (
              <PlanRow key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const t = useT()
  const messageKey: TranslationKeys =
    filter === 'archived'
      ? 'vendor.subscriptionPlans.emptyArchived'
      : filter === 'active'
        ? 'vendor.subscriptionPlans.emptyActive'
        : 'vendor.subscriptionPlans.emptyAll'

  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
      <ArrowPathIcon className="mx-auto h-10 w-10 text-[var(--muted)]" />
      <p className="mt-3 text-[var(--muted)]">{t(messageKey)}</p>
      {filter !== 'archived' && (
        <Link
          href="/vendor/suscripciones/nueva"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
        >
          <PlusIcon className="h-4 w-4" />
          {t('vendor.subscriptionPlans.createFirst')}
        </Link>
      )}
    </div>
  )
}

function PlanRow({ plan }: { plan: Plan }) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const cadenceLabel =
    plan.cadence === 'WEEKLY'   ? t('vendor.subscriptionPlans.cadenceWeekly')   :
    plan.cadence === 'BIWEEKLY' ? t('vendor.subscriptionPlans.cadenceBiweekly') :
    t('vendor.subscriptionPlans.cadenceMonthly')

  const isArchived = plan.archivedAt !== null

  function handleArchive() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        await archiveSubscriptionPlan(plan.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.subscriptionPlans.errorGeneric'))
      }
    })
  }

  function handleUnarchive() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        await unarchiveSubscriptionPlan(plan.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.subscriptionPlans.errorGeneric'))
      }
    })
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
          {plan.product.images?.[0] ? (
            <Image
              src={plan.product.images[0]}
              alt={plan.product.name}
              fill
              className="object-cover"
              sizes="56px"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl">🧺</div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--foreground)] truncate">{plan.product.name}</p>
            <Badge variant={isArchived ? 'default' : 'green'}>
              {isArchived
                ? t('vendor.subscriptionPlans.stateArchived')
                : t('vendor.subscriptionPlans.stateActive')}
            </Badge>
            <Badge variant="blue">{cadenceLabel}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {formatPrice(Number(plan.priceSnapshot))} / {plan.product.unit} ·{' '}
            {t('vendor.subscriptionPlans.cutoffLabel').replace(
              '{day}',
              t(DAY_KEYS[plan.cutoffDayOfWeek])
            )}
          </p>
          {error && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {isArchived ? (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              {t('vendor.subscriptionPlans.unarchive')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleArchive}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              <ArchiveBoxIcon className="h-4 w-4" />
              {t('vendor.subscriptionPlans.archive')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
