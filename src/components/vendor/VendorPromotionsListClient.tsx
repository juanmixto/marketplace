'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  TagIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import { archivePromotion, unarchivePromotion, listMyPromotions } from '@/domains/promotions/actions'
import type { TranslationKeys } from '@/i18n/locales'
import type { BadgeVariant } from '@/domains/catalog/types'

type Promotion = Awaited<ReturnType<typeof listMyPromotions>>[number]

type FilterKey = 'active' | 'archived' | 'all'

const FILTERS: { key: FilterKey; labelKey: TranslationKeys }[] = [
  { key: 'active',   labelKey: 'vendor.promotions.filterActive' },
  { key: 'archived', labelKey: 'vendor.promotions.filterArchived' },
  { key: 'all',      labelKey: 'vendor.promotions.filterAll' },
]

interface Props {
  promotions: Promotion[]
}

export function VendorPromotionsListClient({ promotions }: Props) {
  const t = useT()
  const [filter, setFilter] = useState<FilterKey>('active')
  const now = new Date()

  const filtered = useMemo(() => {
    return promotions.filter(promo => {
      if (filter === 'active') return promo.archivedAt === null
      if (filter === 'archived') return promo.archivedAt !== null
      return true
    })
  }, [promotions, filter])

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {t('vendor.promotions.title')}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {promotions.length === 1
              ? t('vendor.promotions.countOne')
              : t('vendor.promotions.countOther').replace('{count}', String(promotions.length))}
          </p>
        </div>
        <Link
          href="/vendor/promociones/nueva"
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <PlusIcon className="h-4 w-4" />
          {t('vendor.promotions.newPromotion')}
        </Link>
      </div>

      {/* Dormant notice — set expectations: phase 1 does not apply at checkout */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
        <InformationCircleIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="text-sm text-blue-900 dark:text-blue-200">
          <p className="font-semibold">{t('vendor.promotions.dormantNoticeTitle')}</p>
          <p className="mt-0.5 text-blue-800 dark:text-blue-300">
            {t('vendor.promotions.dormantNoticeBody')}
          </p>
        </div>
      </div>

      {/* Filter chips */}
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
            {filtered.map(promo => (
              <PromotionRow key={promo.id} promo={promo} now={now} />
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
      ? 'vendor.promotions.emptyArchived'
      : filter === 'active'
        ? 'vendor.promotions.emptyActive'
        : 'vendor.promotions.emptyAll'

  return (
    <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-16 text-center">
      <TagIcon className="mx-auto h-10 w-10 text-[var(--muted)]" />
      <p className="mt-3 text-[var(--muted)]">{t(messageKey)}</p>
      {filter !== 'archived' && (
        <Link
          href="/vendor/promociones/nueva"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
        >
          <PlusIcon className="h-4 w-4" />
          {t('vendor.promotions.createFirst')}
        </Link>
      )}
    </div>
  )
}

function PromotionRow({ promo, now }: { promo: Promotion; now: Date }) {
  const t = useT()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const state = getPromotionState(promo, now)
  const stateVariant: BadgeVariant =
    state === 'active'     ? 'green' :
    state === 'scheduled'  ? 'blue'  :
    state === 'expired'    ? 'amber' :
    'default'

  const scopeLabel =
    promo.scope === 'PRODUCT'  ? t('vendor.promotions.scopeProduct')  :
    promo.scope === 'CATEGORY' ? t('vendor.promotions.scopeCategory') :
    t('vendor.promotions.scopeVendor')

  const targetLabel =
    promo.scope === 'PRODUCT'  ? promo.product?.name  ?? '—' :
    promo.scope === 'CATEGORY' ? promo.category?.name ?? '—' :
    t('vendor.promotions.scopeWholeStore')

  function handleArchive() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        await archivePromotion(promo.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.promotions.errorGeneric'))
      }
    })
  }

  function handleUnarchive() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      try {
        await unarchivePromotion(promo.id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.promotions.errorGeneric'))
      }
    })
  }

  return (
    <div className="p-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <TagIcon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--foreground)] truncate">{promo.name}</p>
            <Badge variant={stateVariant}>{t(stateLabelKey(state))}</Badge>
            {promo.code && (
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-xs text-[var(--foreground-soft)]">
                {promo.code}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {formatPromotionValue(promo, t)} · {scopeLabel}: {targetLabel}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {t('vendor.promotions.windowLabel')
              .replace('{from}', formatDate(promo.startsAt))
              .replace('{to}',   formatDate(promo.endsAt))}
          </p>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
        </div>

        <div className="shrink-0">
          {promo.archivedAt ? (
            <button
              type="button"
              onClick={handleUnarchive}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground-soft)] transition hover:bg-[var(--surface-raised)] disabled:opacity-60"
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              {t('vendor.promotions.unarchive')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleArchive}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              <ArchiveBoxIcon className="h-4 w-4" />
              {t('vendor.promotions.archive')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type PromotionState = 'active' | 'scheduled' | 'expired' | 'archived'

function getPromotionState(promo: Promotion, now: Date): PromotionState {
  if (promo.archivedAt) return 'archived'
  const t = now.getTime()
  if (t < new Date(promo.startsAt).getTime()) return 'scheduled'
  if (t > new Date(promo.endsAt).getTime()) return 'expired'
  return 'active'
}

function stateLabelKey(state: PromotionState): TranslationKeys {
  switch (state) {
    case 'active':    return 'vendor.promotions.stateActive'
    case 'scheduled': return 'vendor.promotions.stateScheduled'
    case 'expired':   return 'vendor.promotions.stateExpired'
    case 'archived':  return 'vendor.promotions.stateArchived'
  }
}

function formatPromotionValue(
  promo: Promotion,
  t: (key: TranslationKeys) => string
): string {
  if (promo.kind === 'FREE_SHIPPING') return t('vendor.promotions.kindFreeShipping')
  if (promo.kind === 'PERCENTAGE') return `-${Number(promo.value).toFixed(0)}%`
  return `-${formatPrice(Number(promo.value))}`
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value))
}
