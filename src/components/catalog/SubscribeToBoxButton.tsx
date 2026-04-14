'use client'

import { useState, useTransition } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { startSubscriptionCheckout } from '@/domains/subscriptions/buyer-actions'
import { formatPrice } from '@/lib/utils'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

interface Props {
  planId: string
  cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
  priceEur: number
  unit: string
  defaultAddressId: string | null
}

export function SubscribeToBoxButton({
  planId,
  cadence,
  priceEur,
  unit,
  defaultAddressId,
}: Props) {
  const t = useT()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const cadenceKey: TranslationKeys =
    cadence === 'WEEKLY'   ? 'account.subscriptions.cadenceWeekly'   :
    cadence === 'BIWEEKLY' ? 'account.subscriptions.cadenceBiweekly' :
    'account.subscriptions.cadenceMonthly'

  function handleClick() {
    if (pending) return
    if (!defaultAddressId) {
      setError(t('catalog.subscribe.needsAddress'))
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await startSubscriptionCheckout({
          planId,
          shippingAddressId: defaultAddressId,
        })
        window.location.assign(result.url)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('catalog.subscribe.errorGeneric')
        )
      }
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        <ArrowPathIcon className="h-4 w-4" />
        {t('catalog.subscribe.title')}
      </div>
      <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
        {t('catalog.subscribe.body')
          .replace('{price}', formatPrice(priceEur))
          .replace('{unit}', unit)
          .replace('{cadence}', t(cadenceKey).toLowerCase())}
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
      >
        {pending ? t('catalog.subscribe.loading') : t('catalog.subscribe.cta')}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
