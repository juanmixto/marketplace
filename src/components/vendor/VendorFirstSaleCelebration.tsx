'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { XMarkIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import { useT } from '@/i18n'

const STORAGE_PREFIX = 'vendor-first-sale-celebrated-v1:'

interface Props {
  vendorId: string
  vendorName: string
}

export function VendorFirstSaleCelebration({ vendorId, vendorName }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_PREFIX + vendorId)) setOpen(true)
    } catch {}
  }, [vendorId])

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + vendorId, new Date().toISOString())
    } catch {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-first-sale-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={dismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
      >
        <div className="relative bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-6 pb-10 text-white overflow-hidden">
          <div aria-hidden="true" className="absolute -right-4 -top-4 text-7xl opacity-20 select-none">🎉</div>
          <div aria-hidden="true" className="absolute -left-6 bottom-2 text-5xl opacity-20 select-none">🥳</div>

          <button
            type="button"
            onClick={dismiss}
            aria-label={t('vendor.firstSale.dismiss')}
            className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-white/80 hover:bg-white/15 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          <p className="text-xs font-semibold uppercase tracking-widest text-white/90">
            {t('vendor.firstSale.badge')}
          </p>
          <h2 id="vendor-first-sale-title" className="mt-1 text-2xl sm:text-3xl font-extrabold leading-tight">
            {t('vendor.firstSale.title').replace('{name}', vendorName)}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm sm:text-base leading-relaxed text-[var(--foreground-soft)]">
            {t('vendor.firstSale.body')}
          </p>

          <ol className="space-y-2 text-sm text-[var(--foreground-soft)]">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">1</span>
              <span>{t('vendor.firstSale.tip1')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">2</span>
              <span>{t('vendor.firstSale.tip2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">3</span>
              <span>{t('vendor.firstSale.tip3')}</span>
            </li>
          </ol>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {t('vendor.firstSale.dismiss')}
            </button>
            <Link
              href="/vendor/pedidos"
              onClick={dismiss}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 transition-colors"
            >
              <ShoppingBagIcon className="h-4 w-4" />
              {t('vendor.firstSale.goToOrder')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
