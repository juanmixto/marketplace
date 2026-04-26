'use client'

import { useEffect, useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { PresetRange, FilterOptionSet } from '@/domains/analytics/types'
import { useAnalyticsFiltersStore } from './useAnalyticsFiltersStore'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

const PRESET_KEYS: Array<{ value: PresetRange; key: TranslationKeys }> = [
  { value: 'today', key: 'admin.reportsFilters.preset.today' },
  { value: '7d', key: 'admin.reportsFilters.preset.7d' },
  { value: '30d', key: 'admin.reportsFilters.preset.30d' },
  { value: 'mtd', key: 'admin.reportsFilters.preset.mtd' },
  { value: 'custom', key: 'admin.reportsFilters.preset.custom' },
]

const ORDER_STATUS_KEYS: Array<{ value: string; key: TranslationKeys }> = [
  { value: '', key: 'admin.reportsFilters.allMasc' },
  { value: 'PAYMENT_CONFIRMED', key: 'admin.reportsFilters.status.paid' },
  { value: 'PROCESSING', key: 'admin.reportsFilters.status.processing' },
  { value: 'SHIPPED', key: 'admin.reportsFilters.status.shipped' },
  { value: 'DELIVERED', key: 'admin.reportsFilters.status.delivered' },
  { value: 'CANCELLED', key: 'admin.reportsFilters.status.cancelled' },
  { value: 'REFUNDED', key: 'admin.reportsFilters.status.refunded' },
]

interface Props {
  options: FilterOptionSet
  initial: {
    preset: PresetRange
    from: string
    to: string
    vendorId: string
    categoryId: string
    status: string
  }
}

export function AnalyticsFilters({ options, initial }: Props) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const draft = useAnalyticsFiltersStore(s => s.draft)
  const setPreset = useAnalyticsFiltersStore(s => s.setPreset)
  const setField = useAnalyticsFiltersStore(s => s.setField)
  const reset = useAnalyticsFiltersStore(s => s.reset)

  useEffect(() => {
    reset(initial)
  }, [reset, initial])

  const currentQuery = useMemo(() => searchParams.toString(), [searchParams])

  const apply = () => {
    const params = new URLSearchParams()
    params.set('preset', draft.preset)
    if (draft.preset === 'custom') {
      if (draft.from) params.set('from', draft.from)
      if (draft.to) params.set('to', draft.to)
    }
    if (draft.vendorId) params.set('vendor', draft.vendorId)
    if (draft.categoryId) params.set('category', draft.categoryId)
    if (draft.status) params.set('status', draft.status)
    const next = params.toString()
    if (next === currentQuery) return
    startTransition(() => {
      router.push(`${pathname}?${next}`)
    })
  }

  const clear = () => {
    startTransition(() => {
      router.push(pathname)
    })
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_KEYS.map(p => {
            const active = draft.preset === p.value
            return (
              <button
                type="button"
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-emerald-300'
                }`}
              >
                {t(p.key)}
              </button>
            )
          })}
        </div>

        {draft.preset === 'custom' && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t('admin.reportsFilters.from')}
              <input
                type="date"
                value={draft.from}
                onChange={e => setField('from', e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              {t('admin.reportsFilters.to')}
              <input
                type="date"
                value={draft.to}
                onChange={e => setField('to', e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
          </div>
        )}

        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t('admin.reportsFilters.vendor')}
          <select
            value={draft.vendorId}
            onChange={e => setField('vendorId', e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            <option value="">{t('admin.reportsFilters.allMasc')}</option>
            {options.vendors.map(v => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t('admin.reportsFilters.category')}
          <select
            value={draft.categoryId}
            onChange={e => setField('categoryId', e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            <option value="">{t('admin.reportsFilters.allFem')}</option>
            {options.categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs text-[var(--muted)]">
          {t('admin.reportsFilters.status')}
          <select
            value={draft.status}
            onChange={e => setField('status', e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            {ORDER_STATUS_KEYS.map(s => (
              <option key={s.value} value={s.value}>
                {t(s.key)}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--border-strong)]"
          >
            {t('admin.reportsFilters.clear')}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={isPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? t('admin.reportsFilters.applying') : t('admin.reportsFilters.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
