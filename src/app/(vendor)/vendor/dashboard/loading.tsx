/**
 * Dashboard skeleton: heading + 4 stat cards + alerts banner + main panel.
 * Matches the actual page structure so the swap on data-arrival is shift-free.
 */
export default function Loading() {
  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        {/* Page heading */}
        <div className="space-y-2">
          <div className="h-8 w-1/3 rounded bg-emerald-100 dark:bg-emerald-900/40" />
          <div className="h-4 w-1/2 rounded bg-neutral-100 dark:bg-neutral-900" />
        </div>

        {/* Stat cards (4) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="h-4 w-1/2 rounded bg-neutral-100 dark:bg-neutral-900" />
              <div className="mt-3 h-7 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-2 h-3 w-1/3 rounded bg-neutral-100 dark:bg-neutral-900" />
            </div>
          ))}
        </div>

        {/* Recent activity / alerts panel */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="h-5 w-1/4 rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-900" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-neutral-100 dark:bg-neutral-900" />
                  <div className="h-3 w-1/2 rounded bg-neutral-100 dark:bg-neutral-900" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
