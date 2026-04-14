'use client'

import Link from 'next/link'
import { TagIcon } from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import type { PromotionsOverview, PromotionRow } from '@/domains/admin/promotions'
import type { BadgeVariant } from '@/domains/catalog/types'
import type { TranslationKeys } from '@/i18n/locales'

interface Props {
  data: PromotionsOverview
}

export function AdminPromotionsClient({ data }: Props) {
  const t = useT()
  const now = new Date()

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <TagIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {t('adminPromotions.title')}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {t('adminPromotions.subtitle')}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('adminPromotions.kpi.active')}
          value={String(data.kpis.totalActive)}
          accent="emerald"
        />
        <StatCard
          label={t('adminPromotions.kpi.archived')}
          value={String(data.kpis.totalArchived)}
        />
        <StatCard
          label={t('adminPromotions.kpi.redemptions')}
          value={String(data.kpis.totalRedemptions)}
          accent="blue"
        />
        <StatCard
          label={t('adminPromotions.kpi.vendorsRunning')}
          value={String(data.kpis.vendorsRunningPromos)}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {t('adminPromotions.tableTitle')}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            {t('adminPromotions.tableHint')}
          </p>
        </header>
        {data.promotions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            {t('adminPromotions.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-raised)] text-xs uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2 text-left">{t('adminPromotions.col.name')}</th>
                  <th className="px-4 py-2 text-left">{t('adminPromotions.col.vendor')}</th>
                  <th className="px-4 py-2 text-left">{t('adminPromotions.col.kind')}</th>
                  <th className="px-4 py-2 text-left">{t('adminPromotions.col.window')}</th>
                  <th className="px-4 py-2 text-left">{t('adminPromotions.col.state')}</th>
                  <th className="px-4 py-2 text-right">{t('adminPromotions.col.redemptions')}</th>
                  <th className="px-4 py-2 text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {data.promotions.map(row => (
                  <PromoRow key={row.id} row={row} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'amber' | 'red' | 'blue'
}) {
  const accentRing: Record<NonNullable<typeof accent>, string> = {
    emerald: 'ring-emerald-200/60 dark:ring-emerald-800/40',
    amber:   'ring-amber-200/60 dark:ring-amber-800/40',
    red:     'ring-red-200/60 dark:ring-red-800/40',
    blue:    'ring-blue-200/60 dark:ring-blue-800/40',
  }
  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm ring-1 ${
        accent ? accentRing[accent] : 'ring-transparent'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">{value}</p>
    </div>
  )
}

function PromoRow({ row, now }: { row: PromotionRow; now: Date }) {
  const t = useT()

  const state = getPromotionState(row, now)
  const stateVariant: BadgeVariant =
    state === 'active'     ? 'green' :
    state === 'scheduled'  ? 'blue'  :
    state === 'expired'    ? 'amber' :
    'default'
  const stateKey: TranslationKeys =
    state === 'active'     ? 'adminPromotions.state.active'    :
    state === 'scheduled'  ? 'adminPromotions.state.scheduled' :
    state === 'expired'    ? 'adminPromotions.state.expired'   :
    'adminPromotions.state.archived'

  const kindLabel =
    row.kind === 'PERCENTAGE'   ? `-${row.value.toFixed(0)}%` :
    row.kind === 'FIXED_AMOUNT' ? `-${formatPrice(row.value)}` :
    t('adminPromotions.kind.freeShipping')

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-[var(--foreground)]">{row.name}</span>
          {row.code && (
            <span className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">
              {row.code}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-[var(--foreground-soft)]">{row.vendor.displayName}</td>
      <td className="px-4 py-3">
        <Badge variant="default">{kindLabel}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--muted)]">
        {formatDate(row.startsAt)} → {formatDate(row.endsAt)}
      </td>
      <td className="px-4 py-3">
        <Badge variant={stateVariant}>{t(stateKey)}</Badge>
      </td>
      <td className="px-4 py-3 text-right font-medium text-[var(--foreground)]">
        {row.redemptionCount}
        {row.maxRedemptions !== null && (
          <span className="text-xs text-[var(--muted)]"> / {row.maxRedemptions}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/promociones/${row.id}/edit`}
          className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
        >
          Editar
        </Link>
      </td>
    </tr>
  )
}

type PromotionState = 'active' | 'scheduled' | 'expired' | 'archived'

function getPromotionState(row: PromotionRow, now: Date): PromotionState {
  if (row.archivedAt) return 'archived'
  const t = now.getTime()
  if (t < row.startsAt.getTime()) return 'scheduled'
  if (t > row.endsAt.getTime()) return 'expired'
  return 'active'
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value))
}
