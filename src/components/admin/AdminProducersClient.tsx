'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useT, useI18n } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { VendorModerationActions } from '@/components/admin/VendorModerationActions'
import { getVendorStatusTone } from '@/domains/admin/overview'
import {
  PRODUCER_SORT_KEYS,
  PRODUCER_STATUS_FILTERS,
  type EnrichedProducer,
  type ProducerStatusFilter,
  type ProducersOverview,
} from '@/domains/admin/producers'
import type { VendorStatus } from '@/generated/prisma/enums'

const SEARCH_DEBOUNCE_MS = 250

interface Props {
  data: ProducersOverview
}

function fmtCurrency(amount: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtCurrencyPrecise(amount: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(amount)
}

function fmtNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'es-ES').format(value)
}

function fmtDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    dateStyle: 'medium',
  }).format(new Date(iso))
}

function relativeFromNow(
  iso: string | null,
  t: (k: TranslationKeys) => string
): { label: string; tone: 'emerald' | 'amber' | 'red' | 'slate' } {
  if (!iso) return { label: t('adminProducers.lastSeen.never'), tone: 'slate' }
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return { label: t('adminProducers.lastSeen.justNow'), tone: 'emerald' }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return {
      label: t('adminProducers.lastSeen.hoursAgo').replace('{count}', String(hours)),
      tone: 'emerald',
    }
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return {
      label: t('adminProducers.lastSeen.daysAgo').replace('{count}', String(days)),
      tone: 'emerald',
    }
  }
  if (days < 30) {
    return {
      label: t('adminProducers.lastSeen.daysAgo').replace('{count}', String(days)),
      tone: 'amber',
    }
  }
  const months = Math.floor(days / 30)
  return {
    label: t('adminProducers.lastSeen.monthsAgo').replace('{count}', String(months)),
    tone: 'red',
  }
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  const w = 80
  const h = 24
  const step = data.length > 1 ? w / (data.length - 1) : 0
  const points = data
    .map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * (h - 2) - 1).toFixed(2)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: 'emerald' | 'amber' | 'red' | 'blue'
}) {
  const accentRing: Record<NonNullable<typeof accent>, string> = {
    emerald: 'ring-emerald-200/60 dark:ring-emerald-800/40',
    amber: 'ring-amber-200/60 dark:ring-amber-800/40',
    red: 'ring-red-200/60 dark:ring-red-800/40',
    blue: 'ring-blue-200/60 dark:ring-blue-800/40',
  }
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ring-1 ${
        accent ? accentRing[accent] : 'ring-transparent'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  )
}

export function AdminProducersClient({ data }: Props) {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const searchParamsRO = useSearchParams()
  const [isNavigating, startTransition] = useTransition()

  // Keep search input local for snappy typing; debounce into the URL so
  // each keystroke doesn't trigger a server roundtrip. Seeded from the
  // server's normalised params so the input is the source of truth after
  // a full reload.
  const [searchInput, setSearchInput] = useState(data.params.search)

  // Keep the input in sync when the parent re-renders with different
  // normalised params (e.g. after a back/forward navigation).
  useEffect(() => {
    setSearchInput(data.params.search)
  }, [data.params.search])

  // Debounced URL write for the search box. Other controls commit
  // immediately since they click-fire rather than type-fire.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === data.params.search) return
    const handle = setTimeout(() => {
      updateParams({ q: trimmed || undefined, page: undefined })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function updateParams(patch: Partial<Record<'q' | 'status' | 'sort' | 'page', string | undefined>>) {
    const params = new URLSearchParams(searchParamsRO?.toString() ?? '')
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    const href = query ? `${pathname}?${query}` : pathname
    startTransition(() => router.replace(href, { scroll: false }))
  }

  function statusLabel(s: VendorStatus): string {
    return t(`adminProducers.status.${s}` as TranslationKeys)
  }

  function filterLabel(f: ProducerStatusFilter): string {
    if (f === 'ALL') return t('adminProducers.filter.all')
    return statusLabel(f)
  }

  function statusCount(f: ProducerStatusFilter): number {
    if (f === 'ALL') return data.globals.total
    return data.statusCounts[f] ?? 0
  }

  const { pageItems, pagination, params, globals } = data
  const pageStart = (pagination.page - 1) * pagination.pageSize

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t('adminProducers.eyebrow')}
        </p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('adminProducers.title')}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t('adminProducers.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('adminProducers.kpi.gmv')}
          value={fmtCurrency(globals.gmv, locale)}
          hint={t('adminProducers.kpi.gmvHint')}
          accent="emerald"
        />
        <StatCard
          label={t('adminProducers.kpi.orders')}
          value={fmtNumber(globals.orders, locale)}
          hint={t('adminProducers.kpi.ordersHint')}
          accent="blue"
        />
        <StatCard
          label={t('adminProducers.kpi.active')}
          value={fmtNumber(globals.active, locale)}
          hint={t('adminProducers.kpi.totalHint').replace('{count}', String(globals.total))}
          accent="emerald"
        />
        <StatCard
          label={t('adminProducers.kpi.pending')}
          value={fmtNumber(globals.pendingReview, locale)}
          hint={t('adminProducers.kpi.suspendedHint').replace('{count}', String(globals.suspended))}
          accent="amber"
        />
      </div>

      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
        aria-busy={isNavigating}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t('adminProducers.search.placeholder')}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-[var(--muted)]" htmlFor="producers-sort">
              {t('adminProducers.sort.label')}
            </label>
            <select
              id="producers-sort"
              value={params.sort}
              onChange={e => updateParams({ sort: e.target.value, page: undefined })}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {PRODUCER_SORT_KEYS.map(opt => (
                <option key={opt} value={opt}>
                  {t(`adminProducers.sort.${opt}` as TranslationKeys)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRODUCER_STATUS_FILTERS.map(f => {
            const active = params.status === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => updateParams({ status: f === 'ALL' ? undefined : f, page: undefined })}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted)] hover:border-emerald-300 hover:text-[var(--foreground)]'
                }`}
              >
                {filterLabel(f)}
                <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                  {statusCount(f)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-[var(--background)] text-left text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">
              <tr>
                <th className="px-4 py-3">{t('adminProducers.col.producer')}</th>
                <th className="px-4 py-3">{t('adminProducers.col.status')}</th>
                <th className="px-4 py-3 text-right">{t('adminProducers.col.revenue')}</th>
                <th className="px-4 py-3 text-right">{t('adminProducers.col.orders')}</th>
                <th className="px-4 py-3">{t('adminProducers.col.topProduct')}</th>
                <th className="px-4 py-3">{t('adminProducers.col.rating')}</th>
                <th className="px-4 py-3">{t('adminProducers.col.lastSeen')}</th>
                <th className="px-4 py-3">{t('adminProducers.col.trend')}</th>
                <th className="px-4 py-3">{t('adminProducers.col.signup')}</th>
                <th className="px-4 py-3 text-right">{t('adminProducers.col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {pageItems.map(p => (
                <ProducerRow key={p.id} p={p} locale={locale} t={t} />
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-[var(--muted)]">
                    {pagination.totalFiltered === 0 && globals.total > 0
                      ? t('adminProducers.noResults')
                      : t('adminProducers.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pagination.totalFiltered > pagination.pageSize && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 text-xs text-[var(--muted)]">
            <span>
              {t('adminProducers.pagination.range')
                .replace('{from}', String(pageStart + 1))
                .replace(
                  '{to}',
                  String(Math.min(pageStart + pagination.pageSize, pagination.totalFiltered))
                )
                .replace('{total}', String(pagination.totalFiltered))}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => updateParams({ page: String(Math.max(1, pagination.page - 1)) })}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-40"
              >
                {t('adminProducers.pagination.prev')}
              </button>
              <span>
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() =>
                  updateParams({
                    page: String(Math.min(pagination.totalPages, pagination.page + 1)),
                  })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] disabled:opacity-40"
              >
                {t('adminProducers.pagination.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProducerRow({
  p,
  locale,
  t,
}: {
  p: EnrichedProducer
  locale: string
  t: (k: TranslationKeys) => string
}) {
  const lastSeen = relativeFromNow(p.lastSeenAt, t)
  const toneDot: Record<typeof lastSeen.tone, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    slate: 'bg-slate-400',
  }
  const sparkColor =
    lastSeen.tone === 'red' ? '#ef4444' : lastSeen.tone === 'amber' ? '#f59e0b' : '#10b981'

  return (
    <tr className="transition hover:bg-[var(--background)]">
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          {p.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- vendor logo URLs come from arbitrary CDNs allow-listed at upload time; next/image's domain config would re-litigate that allowlist
            <img
              src={p.logo}
              alt=""
              className="h-9 w-9 rounded-full border border-[var(--border)] object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {p.displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <Link
              href={`/productores/${p.slug}`}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-semibold text-[var(--foreground)] hover:text-emerald-700 dark:hover:text-emerald-400"
            >
              {p.displayName}
            </Link>
            <p className="truncate text-xs text-[var(--muted)]">{p.email}</p>
            {p.location && (
              <p className="truncate text-xs text-[var(--muted-light)]">{p.location}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <AdminStatusBadge
            label={t(`adminProducers.status.${p.status}` as TranslationKeys)}
            tone={getVendorStatusTone(p.status)}
          />
          <span className="text-[10px] text-[var(--muted-light)]">
            {p.stripeOnboarded
              ? t('adminProducers.stripe.complete')
              : t('adminProducers.stripe.pending')}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--foreground)]">
        {fmtCurrencyPrecise(p.revenue, locale)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[var(--foreground)]">
        {p.ordersCount}
        <span className="ml-1 text-xs text-[var(--muted-light)]">
          · {p.productsCount} {t('adminProducers.col.products')}
        </span>
      </td>
      <td className="px-4 py-3">
        {p.topProduct ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--foreground)]">{p.topProduct.name}</p>
            <p className="text-xs text-[var(--muted)]">
              {t('adminProducers.topProduct.units').replace('{count}', String(p.topProduct.unitsSold))}
            </p>
          </div>
        ) : (
          <span className="text-xs text-[var(--muted-light)]">
            {t('adminProducers.topProduct.none')}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {p.avgRating != null ? (
          <div className="flex items-center gap-1">
            <span className="text-amber-500">★</span>
            <span className="font-medium tabular-nums text-[var(--foreground)]">
              {p.avgRating.toFixed(1)}
            </span>
            <span className="text-xs text-[var(--muted-light)]">({p.totalReviews})</span>
          </div>
        ) : (
          <span className="text-xs text-[var(--muted-light)]">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${toneDot[lastSeen.tone]}`} aria-hidden />
          <span className="text-xs text-[var(--foreground)]">{lastSeen.label}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Sparkline data={p.sparkline} color={sparkColor} />
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]">{fmtDate(p.createdAt, locale)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/admin/productores/${p.id}/edit`}
            className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Editar
          </Link>
          <VendorModerationActions vendorId={p.id} status={p.status} />
        </div>
      </td>
    </tr>
  )
}
