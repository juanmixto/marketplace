'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StarRating } from '@/components/reviews/StarRating'
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
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1
                const active = value <= rating
                const ariaLabel =
                  value === 1
                    ? t('reviews.starAriaOne')
                    : t('reviews.starAriaOther').replace('{count}', String(value))

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`rounded-xl border px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] ${
                      active
                        ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-50'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-amber-200 hover:bg-[var(--surface-raised)] dark:hover:border-amber-800'
                    }`}
                    aria-label={ariaLabel}
                  >
                    <StarRating rating={value} size="sm" />
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
