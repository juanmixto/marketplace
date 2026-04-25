/**
 * Settlements skeleton: heading + summary cards + chart + table.
 * Mirrors the real page (period selector hidden initially).
 */
export default function Loading() {
  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-1/3 rounded bg-emerald-100 dark:bg-emerald-900/40" />

        {/* Summary cards (3) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="h-3 w-1/2 rounded bg-neutral-100 dark:bg-neutral-900" />
              <div className="mt-3 h-7 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ))}
        </div>

        {/* Chart placeholder */}
        <div className="h-64 rounded-xl border border-[var(--border)] bg-[var(--surface)]" />

        {/* Settlements table */}
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="h-4 w-1/4 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="divide-y divide-[var(--border)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-4 gap-4 px-4 py-3">
                <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-3 rounded bg-neutral-100 dark:bg-neutral-900" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
