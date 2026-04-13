'use client'

import { useState } from 'react'
import { useTransition } from 'react'
import { StarIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { createReview } from '@/domains/reviews/actions'
import { formatDistanceToNow } from 'date-fns'
import { es as esLocale, enUS as enLocale } from 'date-fns/locale'
import { useT, useLocale } from '@/i18n'

interface ReviewData {
  reviews: Array<{
    id: string
    rating: number
    body: string | null
    createdAt: Date
    customer: {
      firstName: string
      lastName: string
    }
  }>
  averageRating: number | null
  totalReviews: number
}

interface ReviewSectionProps {
  productId: string
  vendorId: string
  reviews: ReviewData
  eligibleOrders?: Array<{ orderId: string; productId: string }>
  userAuthenticated?: boolean
}

export function ReviewSection({
  productId,
  reviews,
  eligibleOrders = [],
  userAuthenticated = false,
}: ReviewSectionProps) {
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = locale === 'en' ? enLocale : esLocale
  const [isPending, startTransition] = useTransition()
  const [rating, setRating] = useState<number>(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [allReviews, setAllReviews] = useState(reviews.reviews)
  const [avgRating, setAvgRating] = useState(reviews.averageRating)
  const [totalCount, setTotalCount] = useState(reviews.totalReviews)

  // Find eligible order for this product
  const myOrderId = eligibleOrders.find(o => o.productId === productId)?.orderId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rating || !myOrderId) return

    startTransition(async () => {
      try {
        setError(null)
        await createReview(myOrderId, productId, rating, body || undefined)

        // Optimistic update
        setSuccess(true)
        setRating(0)
        setBody('')

        // Simulate new review for optimistic UI
        const newReview = {
          id: 'temp-' + Date.now(),
          rating,
          body: body || null,
          createdAt: new Date(),
          customer: {
            firstName: 'Yo',
            lastName: '',
          },
        }

        setAllReviews([newReview, ...allReviews])
        const newAvg = avgRating
          ? (avgRating * totalCount + rating) / (totalCount + 1)
          : rating
        setAvgRating(newAvg)
        setTotalCount(totalCount + 1)

        setTimeout(() => setSuccess(false), 3000)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('reviews.submitError'))
      }
    })
  }

  const totalLabel =
    totalCount === 1
      ? t('reviews.totalOne')
      : t('reviews.totalOther').replace('{count}', String(totalCount))

  return (
    <div className="space-y-8">
      {/* Rating Summary */}
      <div className="gap-8 md:flex md:items-start">
        <div className="md:w-32">
          {avgRating ? (
            <>
              <div className="mb-2 text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                {avgRating.toFixed(1)}
              </div>
              <div className="mb-2 flex gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <StarIcon key={i} className="h-5 w-5 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-gray-600 dark:text-[var(--muted)]">{totalLabel}</p>
            </>
          ) : (
            <p className="text-gray-600 dark:text-[var(--muted)]">{t('reviews.emptyShort')}</p>
          )}
        </div>

        {/* Reviews List */}
        <div className="flex-1 space-y-4">
          {allReviews.length > 0 ? (
            allReviews.map(review => {
              const timeAgo = formatDistanceToNow(new Date(review.createdAt), {
                locale: dateLocale,
                addSuffix: false,
              })
              return (
                <div
                  key={review.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[var(--border)] dark:bg-[var(--surface)]"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-[var(--foreground)]">
                        {review.customer.firstName} {review.customer.lastName}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-[var(--muted)]">
                        {t('reviews.ago').replace('{time}', timeAgo)}
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(i => (
                        <StarIcon
                          key={i}
                          className={`h-4 w-4 ${
                            i <= review.rating
                              ? 'text-yellow-400'
                              : 'text-gray-300 dark:text-slate-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {review.body && (
                    <p className="text-sm text-gray-700 dark:text-[var(--foreground-soft)]">{review.body}</p>
                  )}
                </div>
              )
            })
          ) : (
            <p className="text-center text-gray-600 dark:text-[var(--muted)]">{t('reviews.emptyBeFirst')}</p>
          )}
        </div>
      </div>

      {/* Review Form */}
      {userAuthenticated && myOrderId && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800/60 dark:bg-emerald-950/30">
          <h3 className="mb-4 font-semibold text-gray-900 dark:text-[var(--foreground)]">{t('reviews.leave')}</h3>

          {success && (
            <div className="mb-4 rounded-lg bg-green-100 p-3 text-green-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              ✓ {t('reviews.success')}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-100 p-3 text-red-800 dark:bg-red-950/40 dark:text-red-300">
              ✗ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Star Rating */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-[var(--foreground)]">
                {t('reviews.rating')} *
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRating(i)}
                    className="focus:outline-none"
                    disabled={isPending}
                    aria-label={
                      i === 1
                        ? t('reviews.starAriaOne')
                        : t('reviews.starAriaOther').replace('{count}', String(i))
                    }
                  >
                    {i <= rating ? (
                      <StarIcon className="h-8 w-8 text-yellow-400" />
                    ) : (
                      <StarOutlineIcon className="h-8 w-8 text-gray-400 hover:text-yellow-300 dark:text-slate-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-[var(--foreground)]">
                {t('reviews.commentOptional')}
              </label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={1000}
                disabled={isPending}
                placeholder={t('reviews.commentPlaceholderShort')}
                className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:bg-gray-100 dark:border-[var(--border)] dark:bg-[var(--surface)] dark:text-[var(--foreground)] dark:placeholder-[var(--muted-light)] dark:focus:ring-emerald-900/60 dark:disabled:bg-[var(--surface-raised)]"
                rows={3}
              />
              <p className="mt-1 text-xs text-gray-600 dark:text-[var(--muted)]">{body.length}/1000</p>
            </div>

            <button
              type="submit"
              disabled={!rating || isPending}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700"
            >
              {isPending ? t('reviews.submitting') : t('reviews.submit')}
            </button>
          </form>
        </div>
      )}

      {!userAuthenticated && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-6 text-center dark:border-blue-800/60 dark:bg-blue-950/30">
          <p className="text-sm text-blue-900 dark:text-blue-300">{t('reviews.loginPrompt')}</p>
        </div>
      )}
    </div>
  )
}
