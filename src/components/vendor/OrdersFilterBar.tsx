'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useT } from '@/i18n'

interface Props {
  currentQ: string
  currentFrom: string
  currentTo: string
  currentSort: string
}

export function OrdersFilterBar({ currentQ, currentFrom, currentTo, currentSort }: Props) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [q, setQ] = useState(currentQ)
  const [from, setFrom] = useState(currentFrom)
  const [to, setTo] = useState(currentTo)

  useEffect(() => { setQ(currentQ) }, [currentQ])
  useEffect(() => { setFrom(currentFrom) }, [currentFrom])
  useEffect(() => { setTo(currentTo) }, [currentTo])

  function pushParams(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  function setParam(key: string, value: string) {
    pushParams(p => {
      if (value) p.set(key, value)
      else p.delete(key)
    })
  }

  // debounce search
  useEffect(() => {
    if (q === currentQ) return
    const id = setTimeout(() => setParam('q', q.trim()), 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const inputCls =
    'min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm ' +
    'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ' +
    'dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20'

  const hasAnyFilter = Boolean(currentQ || currentFrom || currentTo || searchParams.get('estado'))

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-[var(--muted)]">{t('vendor.orders.filters.searchLabel')}</span>
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('vendor.orders.filters.searchPlaceholder')}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:w-40">
          <span className="text-xs font-medium text-[var(--muted)]">{t('vendor.orders.filters.from')}</span>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setParam('desde', e.target.value) }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:w-40">
          <span className="text-xs font-medium text-[var(--muted)]">{t('vendor.orders.filters.to')}</span>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setParam('hasta', e.target.value) }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 sm:w-48">
          <span className="text-xs font-medium text-[var(--muted)]">{t('vendor.orders.filters.sort')}</span>
          <select
            value={currentSort}
            onChange={e => setParam('orden', e.target.value === 'recent' ? '' : e.target.value)}
            className={`${inputCls} cursor-pointer appearance-none pr-9`}
          >
            <option value="recent">{t('vendor.orders.filters.sortRecent')}</option>
            <option value="oldest">{t('vendor.orders.filters.sortOldest')}</option>
            <option value="amount_desc">{t('vendor.orders.filters.sortAmountDesc')}</option>
            <option value="amount_asc">{t('vendor.orders.filters.sortAmountAsc')}</option>
            <option value="customer">{t('vendor.orders.filters.sortCustomer')}</option>
          </select>
        </label>
      </div>

      {hasAnyFilter && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => { startTransition(() => router.replace(pathname)) }}
            className="text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            {t('vendor.orders.filters.clear')}
          </button>
        </div>
      )}
    </div>
  )
}
