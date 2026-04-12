'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CubeIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import { updateProduct, submitForReview } from '@/domains/vendors/actions'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n'

export type ProductProblem =
  | 'rejected'
  | 'expired'
  | 'out-of-stock'
  | 'low-stock'
  | 'draft'
  | null

interface Props {
  product: {
    id: string
    status: string
    stock: number
    trackStock: boolean
    expiresAt?: Date | string | null
  }
  problem: ProductProblem
}

export function ProductQuickFix({ product, problem }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [stockValue, setStockValue] = useState<string>(
    String(product.stock > 0 ? product.stock : 10),
  )
  const [dateValue, setDateValue] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().slice(0, 10)
  })

  if (!problem) return null

  function run(action: () => Promise<unknown>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        setOpen(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  if (problem === 'rejected') {
    return (
      <Link
        href={`/vendor/productos/${product.id}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
      >
        <PencilSquareIcon className="h-3.5 w-3.5" />
        {t('vendor.fix.editAndResubmit')}
      </Link>
    )
  }

  if (problem === 'draft') {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => submitForReview(product.id))}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
      >
        {pending ? (
          <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <PaperAirplaneIcon className="h-3.5 w-3.5" />
        )}
        {t('vendor.fix.submitForReview')}
      </button>
    )
  }

  if (problem === 'expired') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 dark:bg-amber-500 dark:text-gray-950 dark:hover:bg-amber-400"
        >
          <CalendarDaysIcon className="h-3.5 w-3.5" />
          {t('vendor.fix.renew')}
        </button>
        {open && (
          <Popover onClose={() => setOpen(false)}>
            <p className="mb-2 text-xs font-medium text-[var(--foreground-soft)]">
              {t('vendor.fix.newExpiration')}
            </p>
            <input
              type="date"
              value={dateValue}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDateValue(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                {t('vendor.fix.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={pending}
                onClick={() => run(() => updateProduct(product.id, { expiresAt: dateValue }))}
              >
                {t('vendor.fix.save')}
              </Button>
            </div>
          </Popover>
        )}
      </div>
    )
  }

  // out-of-stock or low-stock
  const isOut = problem === 'out-of-stock'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
          isOut
            ? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400'
            : 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:text-gray-950 dark:hover:bg-amber-400'
        }`}
      >
        <CubeIcon className="h-3.5 w-3.5" />
        {t('vendor.fix.restock')}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <p className="mb-2 text-xs font-medium text-[var(--foreground-soft)]">
            {t('vendor.fix.newStock')}
          </p>
          <input
            type="number"
            min={0}
            value={stockValue}
            autoFocus
            onChange={e => setStockValue(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {t('vendor.fix.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={pending}
              onClick={() => {
                const n = Number(stockValue)
                if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
                  setError(t('vendor.fix.invalidStock'))
                  return
                }
                run(() => updateProduct(product.id, { stock: n }))
              }}
            >
              {t('vendor.fix.save')}
            </Button>
          </div>
        </Popover>
      )}
    </div>
  )
}

function Popover({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
        {children}
      </div>
    </>
  )
}
