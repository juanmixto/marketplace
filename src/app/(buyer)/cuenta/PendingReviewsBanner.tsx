import { getServerT } from '@/i18n/server'
import { shouldShowHubBanner } from '@/domains/reviews/nudge-window'
import { PendingReviewsBannerView } from './PendingReviewsBannerView'

interface Props {
  pendingCount: number
  /** placedAt of every order that still has pending reviews (post soft-skip). */
  pendingOrderDates: Date[]
}

/**
 * Server-side wrapper. Decides on stale-only short-circuit (no fresh pending
 * orders → no banner at all, regardless of snooze) and resolves the i18n
 * label, then hands off to the client view that owns the snooze gating.
 */
export async function PendingReviewsBanner({ pendingCount, pendingOrderDates }: Props) {
  if (pendingCount <= 0) return null
  if (!shouldShowHubBanner(pendingOrderDates)) return null

  const t = await getServerT()
  const title =
    pendingCount === 1
      ? t('pendingReviews.bannerCountOne')
      : t('pendingReviews.bannerCountOther').replace('{count}', String(pendingCount))

  return <PendingReviewsBannerView title={title} />
}
