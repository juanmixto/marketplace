'use client'

import dynamic from 'next/dynamic'

const StripeSkeleton = () => (
  <div className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6" aria-busy="true">
    <div className="space-y-2">
      <div className="h-7 w-1/3 rounded bg-emerald-100 dark:bg-emerald-900/40 animate-pulse" />
      <div className="h-4 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
    </div>
    <div className="h-80 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] animate-pulse" />
    <div className="flex items-center justify-end">
      <div className="h-11 w-40 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 animate-pulse" />
    </div>
  </div>
)

export const StripeCheckoutFormLazy = dynamic(
  () => import('./StripeCheckoutForm').then(m => m.StripeCheckoutForm),
  { ssr: false, loading: StripeSkeleton }
)
