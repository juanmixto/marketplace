'use client'

import Link from 'next/link'
import { StarIcon } from '@heroicons/react/24/solid'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { useReviewSnooze } from '@/lib/hooks/useReviewSnooze'

interface Props {
  title: string
}

/**
 * Client part of the hub banner. Hides itself when the buyer-controlled
 * snooze (set by tapping "Cerrar" in the wizard) is active. The `ready` gate
 * avoids a one-frame flash on first paint when storage holds an active
 * snooze.
 */
export function PendingReviewsBannerView({ title }: Props) {
  const { isSnoozed, ready } = useReviewSnooze()
  if (!ready) return null
  if (isSnoozed) return null

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
