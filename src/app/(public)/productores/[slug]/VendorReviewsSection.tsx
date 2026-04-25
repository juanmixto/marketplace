'use client'

import { StarIcon } from '@heroicons/react/24/solid'
import { formatRelativeTime } from '@/lib/format-relative-time'
import { useT, useLocale } from '@/i18n'

interface Review {
  id: string
  rating: number
  body: string | null
  createdAt: Date
  customer: {
    firstName: string
  }
  product: {
    name: string
  }
}

interface VendorReviewsSectionProps {
  reviews: Review[]
  avgRating: number | null
  totalReviews: number
  hideSummary?: boolean
}

export function VendorReviewsSection({
  reviews,
  avgRating,
  totalReviews,
  hideSummary = false,
}: VendorReviewsSectionProps) {
  const t = useT()
  const { locale } = useLocale()

  if (totalReviews === 0 && !avgRating) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-[var(--muted)] shadow-sm">
        {t('reviews.empty')}
      </div>
    )
  }

  const totalLabel =
    totalReviews === 1
      ? t('reviews.totalOne')
      : t('reviews.totalOther').replace('{count}', String(totalReviews))

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      {!hideSummary && (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex items-center gap-6 border-b border-[var(--border)] pb-5">
          <div>
            <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
              {avgRating ? avgRating.toFixed(1) : 'N/A'}
            </div>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <StarIcon
                  key={i}
                  className={`h-5 w-5 ${
                    avgRating && i <= Math.round(avgRating)
                      ? 'text-amber-400 dark:text-amber-300'
                      : 'text-[var(--border-strong)]'
                  }`}
                />
              ))}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{totalLabel}</p>
          </div>
        </div>
      </div>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.map(review => {
          const timeAgo = formatRelativeTime(review.createdAt, { locale })
          return (
            <article
              key={review.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
            >
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[var(--foreground)]">
                    {review.customer.firstName}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {review.product.name} · {t('reviews.ago').replace('{time}', timeAgo)}
                  </p>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <StarIcon
                      key={i}
                      className={`h-4 w-4 ${
                        i <= review.rating
                          ? 'text-amber-400 dark:text-amber-300'
                          : 'text-[var(--border-strong)]'
                      }`}
                    />
                  ))}
                </div>
              </div>
              {review.body && (
                <p className="text-sm text-[var(--foreground-soft)]">{review.body}</p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
