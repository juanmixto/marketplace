'use client'

import { useEffect, useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { PresetRange, FilterOptionSet } from '@/domains/analytics/types'
import { useAnalyticsFiltersStore } from './useAnalyticsFiltersStore'

const PRESET_LABELS: Array<{ value: PresetRange; label: string }> = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'mtd', label: 'Este mes' },
  { value: 'custom', label: 'Personalizado' },
]

const ORDER_STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'PAYMENT_CONFIRMED', label: 'Pagado' },
  { value: 'PROCESSING', label: 'Procesando' },
  { value: 'SHIPPED', label: 'Enviado' },
  { value: 'DELIVERED', label: 'Entregado' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'REFUNDED', label: 'Reembolsado' },
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
          {PRESET_LABELS.map(p => {
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
                {p.label}
              </button>
            )
          })}
        </div>

        {draft.preset === 'custom' && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col text-xs text-[var(--muted)]">
              Desde
              <input
                type="date"
                value={draft.from}
                onChange={e => setField('from', e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="flex flex-col text-xs text-[var(--muted)]">
              Hasta
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
          Productor
          <select
            value={draft.vendorId}
            onChange={e => setField('vendorId', e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            <option value="">Todos</option>
            {options.vendors.map(v => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs text-[var(--muted)]">
          Categoría
          <select
            value={draft.categoryId}
            onChange={e => setField('categoryId', e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            <option value="">Todas</option>
            {options.categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-xs text-[var(--muted)]">
          Estado
          <select
            value={draft.status}
            onChange={e => setField('status', e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
          >
            {ORDER_STATUSES.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
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
            Limpiar
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={isPending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? 'Aplicando…' : 'Aplicar filtros'}
          </button>
        </div>
      </div>
    </div>
  )
}
