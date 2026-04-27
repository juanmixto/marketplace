'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { createReview } from '@/domains/reviews/actions'
import { useT } from '@/i18n'

interface SingleProps {
  orderId: string
  productId: string
  productName: string
}

/**
 * Per-line "Deja tu reseña" button. Kept for the row-by-row review entry
 * point inside the order detail. The new wizard (`ReviewWizardButton`) is
 * the preferred entry point when an order has more than one pending product.
 */
export function ReviewFormButton({ orderId, productId, productName }: SingleProps) {
  const router = useRouter()
  const t = useT()
  const [open, setOpen] = useState(false)

  const modalTitle = t('reviews.rate').replace('{product}', productName)

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {t('reviews.leave')}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={modalTitle} size="md">
        <ReviewFormBody
          orderId={orderId}
          productId={productId}
          onSubmitted={() => {
            setOpen(false)
            router.refresh()
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  )
}

interface WizardItem {
  productId: string
  productName: string
}

interface WizardProps {
  orderId: string
  items: WizardItem[]
  /** Optional override for the trigger button label. */
  triggerLabelKey?: 'reviews.startWizard' | 'reviews.leave' | 'reviews.continueWizard'
  triggerClassName?: string
}

/**
 * Sequential review modal. Walks the buyer through every pending product in
 * an order one form at a time. They can:
 *   - Submit a review for the current product → moves to the next.
 *   - Skip the current product → moves to the next without writing a review.
 *   - Skip all → close the wizard.
 *
 * Closing via the X / backdrop / Escape behaves like "skip all".
 */
export function ReviewWizardButton({
  orderId,
  items,
  triggerLabelKey = 'reviews.startWizard',
  triggerClassName,
}: WizardProps) {
  const router = useRouter()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [submittedAny, setSubmittedAny] = useState(false)

  // Reset cursor whenever the wizard opens, in case the surrounding `items`
  // prop changed between sessions.
  useEffect(() => {
    if (open) {
      setCursor(0)
      setSubmittedAny(false)
    }
  }, [open])

  if (items.length === 0) return null

  const current = items[cursor]
  const total = items.length
  const isLast = cursor >= total - 1

  const closeWizard = () => {
    setOpen(false)
    if (submittedAny) router.refresh()
  }
  const advance = () => {
    if (isLast) {
      closeWizard()
    } else {
      setCursor(c => c + 1)
    }
  }

  const title = current
    ? `${t('reviews.rate').replace('{product}', current.productName)} (${cursor + 1}/${total})`
    : ''

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className={triggerClassName}>
        {t(triggerLabelKey)}
      </Button>

      <Modal open={open} onClose={closeWizard} title={title} size="md">
        {current && (
          <ReviewFormBody
            // Re-key per step so the textarea / rating from product N do not
            // leak into product N+1.
            key={current.productId}
            orderId={orderId}
            productId={current.productId}
            wizardCursor={{ index: cursor, total }}
            onSubmitted={() => {
              setSubmittedAny(true)
              advance()
            }}
            onSkip={advance}
            onCancel={closeWizard}
          />
        )}
      </Modal>
    </>
  )
}

interface FormBodyProps {
  orderId: string
  productId: string
  /** When provided, the form renders wizard-aware controls (Skip + Skip all). */
  wizardCursor?: { index: number; total: number }
  onSubmitted: () => void
  onSkip?: () => void
  onCancel: () => void
}

function ReviewFormBody({ orderId, productId, wizardCursor, onSubmitted, onSkip, onCancel }: FormBodyProps) {
  const t = useT()
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
        onSubmitted()
      } catch (err) {
        setError(err instanceof Error ? err.message : t('reviews.submitError'))
      }
    })
  }

  const isWizard = !!wizardCursor
  const isLastWizardStep = isWizard && wizardCursor!.index >= wizardCursor!.total - 1

  return (
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
          spellCheck
          autoCapitalize="sentences"
          maxLength={1000}
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder={t('reviews.commentPlaceholder')}
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">{body.length}/1000</p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {isWizard && onSkip ? (
          <>
            <Button variant="secondary" onClick={onCancel}>
              {t('reviews.skipAll')}
            </Button>
            <Button variant="secondary" onClick={onSkip}>
              {t('reviews.skipThis')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button isLoading={isPending} onClick={handleSubmit}>
          {isWizard
            ? (isLastWizardStep ? t('reviews.submitAndFinish') : t('reviews.submitAndNext'))
            : t('reviews.submit')}
        </Button>
      </div>
    </div>
  )
}
