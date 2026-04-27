import Link from 'next/link'
import { StarIcon } from '@heroicons/react/24/solid'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
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
      href="/cuenta/pedidos?filter=por-valorar"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300 hover:shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:border-amber-700"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
        <StarIcon className="h-5 w-5" />
      </div>
      <p className="flex-1 font-semibold text-amber-900 dark:text-amber-100">{title}</p>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-amber-700/60 dark:text-amber-300/60" />
    </Link>
  )
}
