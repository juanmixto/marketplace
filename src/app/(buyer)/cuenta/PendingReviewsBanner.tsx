import Link from 'next/link'
import { StarIcon } from '@heroicons/react/24/solid'
import { getServerT } from '@/i18n/server'

interface Props {
  pendingCount: number
}

export async function PendingReviewsBanner({ pendingCount }: Props) {
  if (pendingCount <= 0) return null

  const t = await getServerT()
  const title =
    pendingCount === 1
      ? t('pendingReviews.bannerCountOne')
      : t('pendingReviews.bannerCountOther').replace('{count}', String(pendingCount))

  return (
    <Link
      href="/cuenta/pedidos"
      className="mb-6 flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300 hover:shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:border-amber-700"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
        <StarIcon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-amber-900 dark:text-amber-100">{title}</p>
        <p className="mt-0.5 text-sm text-amber-800/80 dark:text-amber-200/80">
          {t('pendingReviews.bannerSubtitle')}
        </p>
      </div>
      <span className="hidden shrink-0 text-sm font-medium text-amber-700 dark:text-amber-300 sm:inline">
        {t('pendingReviews.bannerCta')} →
      </span>
    </Link>
  )
}
