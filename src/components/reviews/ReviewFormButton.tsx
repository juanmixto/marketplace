'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { createReview } from '@/domains/reviews/actions'
import { useT } from '@/i18n'

interface Props {
  orderId: string
  productId: string
  productName: string
}

export function ReviewFormButton({ orderId, productId, productName }: Props) {
  const router = useRouter()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [hoverRating, setHoverRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)

    startTransition(async () => {
      try {
        await createReview(orderId, productId, rating, body || undefined)
        setOpen(false)
        setBody('')
        setRating(5)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('reviews.submitError'))
      }
    })
  }

  const modalTitle = t('reviews.rate').replace('{product}', productName)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {t('reviews.leave')}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle} size="md">
        <div className="space-y-5 p-5">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{t('reviews.yourRating')}</p>
            <div
              className="mt-3 flex items-center gap-1"
              onMouseLeave={() => setHoverRating(0)}
            >
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1
                const displayed = hoverRating || rating
                const active = value <= displayed
                const Icon = active ? StarSolidIcon : StarOutlineIcon
                const ariaLabel =
                  value === 1
                    ? t('reviews.starAriaOne')
                    : t('reviews.starAriaOther').replace('{count}', String(value))

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    onMouseEnter={() => setHoverRating(value)}
                    onFocus={() => setHoverRating(value)}
                    onBlur={() => setHoverRating(0)}
                    aria-label={ariaLabel}
                    aria-pressed={value === rating}
                    className="rounded-lg p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                  >
                    <Icon
                      className={`h-8 w-8 transition-colors ${
                        active
                          ? 'text-amber-400 dark:text-amber-300'
                          : 'text-[var(--border-strong)] hover:text-amber-300'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor={`review-${productId}`} className="text-sm font-medium text-[var(--foreground)]">
              {t('reviews.comment')}
            </label>
            <textarea
              id={`review-${productId}`}
              rows={5}
              maxLength={1000}
              value={body}
              onChange={event => setBody(event.target.value)}
              placeholder={t('reviews.commentPlaceholder')}
              className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">{body.length}/1000</p>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button isLoading={isPending} onClick={handleSubmit}>
              {t('reviews.submit')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
