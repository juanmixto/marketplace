'use client'

import { useState, useTransition } from 'react'
import { useLocale } from '@/i18n'
import { getCatalogCopy } from '@/i18n/catalog-copy'
import { reportReview } from '@/domains/reviews/actions'
import type { ReportReviewInput } from '@/domains/reviews/actions'

interface Props {
  reviewId: string
  target?: 'REVIEW_BODY' | 'VENDOR_RESPONSE'
}

type Reason = ReportReviewInput['reason']
const REASONS: readonly Reason[] = ['SPAM', 'OFFENSIVE', 'OFF_TOPIC', 'FAKE', 'OTHER']

/**
 * Small report affordance next to every public review and vendor
 * response (#571). Clicking opens a tiny reason picker; submitting
 * calls the `reportReview` server action and then flips to a
 * "thanks" state. Does NOT mutate the review content — just pushes a
 * row into `ReviewReport` for moderators.
 *
 * Unauthenticated callers still see the button; the server action
 * rejects with "Debes iniciar sesión" and we surface that inline.
 */
export function ReportReviewButton({ reviewId, target = 'REVIEW_BODY' }: Props) {
  const { locale } = useLocale()
  const copy = getCatalogCopy(locale).reviews
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (reason: Reason) => {
    setError(null)
    startTransition(async () => {
      try {
        await reportReview({ reviewId, reason, target })
        setDone(true)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error')
      }
    })
  }

  if (done) {
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400">
        ✓ {copy.reportDone}
      </span>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.reportAria}
        className="text-xs text-[var(--muted)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
      >
        {copy.reportLabel}
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <p className="text-xs font-semibold text-[var(--foreground)]">
        {copy.reportReasonTitle}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REASONS.map(reason => (
          <button
            key={reason}
            type="button"
            disabled={pending}
            onClick={() => submit(reason)}
            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--foreground-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            {copy.reportReasons[reason]}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
