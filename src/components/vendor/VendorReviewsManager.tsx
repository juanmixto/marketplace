'use client'

import { useState, useTransition } from 'react'
import { StarIcon } from '@heroicons/react/24/solid'
import { ChatBubbleLeftIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatDistanceToNow } from 'date-fns'
import { es as esLocale, enUS as enLocale } from 'date-fns/locale'
import { useT, useLocale } from '@/i18n'
import { respondToReview, deleteReviewResponse } from '@/domains/reviews/actions'

interface Review {
  id: string
  rating: number
  body: string | null
  createdAt: Date
  vendorResponse: string | null
  vendorResponseAt: Date | null
  customer: { firstName: string; lastName: string }
  product: { name: string; slug: string }
}

interface Props {
  reviews: Review[]
  avgRating: number | null
  totalReviews: number
}

export function VendorReviewsManager({ reviews, avgRating, totalReviews }: Props) {
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = locale === 'en' ? enLocale : esLocale

  const totalLabel =
    totalReviews === 1
      ? t('reviews.totalOne')
      : t('reviews.totalOther').replace('{count}', String(totalReviews))

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
              {avgRating ? avgRating.toFixed(1) : '—'}
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

      <div className="space-y-4">
        {reviews.map(review => (
          <ReviewCard key={review.id} review={review} dateLocale={dateLocale} t={t} />
        ))}
      </div>
    </div>
  )
}

function ReviewCard({
  review,
  dateLocale,
  t,
}: {
  review: Review
  dateLocale: typeof esLocale
  t: ReturnType<typeof useT>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(review.vendorResponse ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const timeAgo = formatDistanceToNow(new Date(review.createdAt), {
    locale: dateLocale,
    addSuffix: false,
  })

  const submit = () => {
    setError(null)
    const trimmed = draft.trim()
    if (!trimmed) {
      setError(t('vendor.reviewsManager.emptyError'))
      return
    }
    startTransition(async () => {
      try {
        await respondToReview({ reviewId: review.id, response: trimmed })
        setEditing(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.reviewsManager.saveError'))
      }
    })
  }

  const remove = () => {
    if (!confirm(t('vendor.reviewsManager.deleteConfirm'))) return
    startTransition(async () => {
      try {
        await deleteReviewResponse(review.id)
        setDraft('')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('vendor.reviewsManager.deleteError'))
      }
    })
  }

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-[var(--foreground)]">
            {review.customer.firstName} {review.customer.lastName}
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

      {/* Existing response (not editing) */}
      {review.vendorResponse && !editing && (
        <div className="mt-4 rounded-xl border-l-2 border-emerald-500 bg-emerald-50/60 p-3 dark:border-emerald-400 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {t('vendor.reviewsManager.yourResponse')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground-soft)]">
                {review.vendorResponse}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={pending}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-2.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                aria-label={t('vendor.reviewsManager.editResponse')}
              >
                <PencilSquareIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-2.5 text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                aria-label={t('vendor.reviewsManager.deleteResponse')}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No response + not editing → show "Responder" button */}
      {!review.vendorResponse && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-soft)] hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-400"
        >
          <ChatBubbleLeftIcon className="h-4 w-4" />
          {t('vendor.reviewsManager.reply')}
        </button>
      )}

      {/* Editing form */}
      {editing && (
        <div className="mt-4 space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            spellCheck
            autoCapitalize="sentences"
            maxLength={1000}
            disabled={pending}
            placeholder={t('vendor.reviewsManager.placeholder')}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-light)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">{draft.length}/1000</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(review.vendorResponse ?? '')
                  setError(null)
                }}
                disabled={pending}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !draft.trim()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {pending ? t('vendor.reviewsManager.saving') : t('vendor.reviewsManager.publish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
