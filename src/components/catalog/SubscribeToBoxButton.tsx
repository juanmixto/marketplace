import Link from 'next/link'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

interface Props {
  productId: string
}

/**
 * Entry point for the subscription flow from the product detail page.
 * Does NOT start the checkout directly — instead links to the
 * confirmation page where the buyer picks the frequency, shipping
 * address, and first delivery date, reviews the commitment, and only
 * then confirms.
 *
 * This component is intentionally cadence-agnostic: the product may
 * have several plans (weekly/biweekly/monthly) and the buyer picks on
 * the next page. No cadence or price is rendered here to keep the CTA
 * short and hide the decision one click away.
 */
export function SubscribeToBoxButton({ productId }: Props) {
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        <ArrowPathIcon className="h-4 w-4" />
        Recíbelo de forma recurrente
      </div>
      <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
        Suscríbete y elige la frecuencia en el siguiente paso. Podrás saltar
        entregas, pausar o cancelar cuando quieras.
      </p>
      <Link
        href={`/cuenta/suscripciones/nueva?productId=${productId}`}
        data-testid="subscribe-to-box-cta"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
      >
        Suscribirme a la caja
      </Link>
    </div>
  )
}
