import Link from 'next/link'
import { StarIcon } from '@heroicons/react/24/solid'
import { getServerT } from '@/i18n/server'

interface Props {
  pendingCount: number
  orderId: string
}

export async function VendorReviewPromptCta({ pendingCount, orderId }: Props) {
  if (pendingCount <= 0) return null

  const t = await getServerT()

  return (
    <div className="mb-6 flex flex-col items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:flex-row sm:items-center dark:border-emerald-800/60 dark:bg-emerald-950/30">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
        <StarIcon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-emerald-900 dark:text-emerald-100">
          {t('pendingReviews.vendorCtaTitle')}
        </p>
        <p className="mt-0.5 text-sm text-emerald-800/80 dark:text-emerald-200/80">
          {t('pendingReviews.vendorCtaSubtitle')}
        </p>
      </div>
      <Link
        href={`/cuenta/pedidos/${orderId}`}
        className="inline-flex items-center rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
      >
        {t('pendingReviews.vendorCtaAction')} →
      </Link>
    </div>
  )
}
