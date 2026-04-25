/**
 * Orders skeleton: heading + filter bar + list of order rows (10 rows).
 * Each row mirrors the real layout — image thumb, customer + status,
 * actions on the right — so the data-arrival paint doesn't shift.
 */
export default function Loading() {
  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-4">
        {/* Heading */}
        <div className="h-8 w-1/4 rounded bg-emerald-100 dark:bg-emerald-900/40" />

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-20 rounded-full bg-neutral-100 dark:bg-neutral-900"
            />
          ))}
        </div>

        {/* Order rows */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="h-14 w-14 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-900" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-1/2 rounded bg-neutral-100 dark:bg-neutral-900" />
              </div>
              <div className="hidden flex-col items-end gap-2 sm:flex">
                <div className="h-5 w-16 rounded-full bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-3 w-12 rounded bg-neutral-100 dark:bg-neutral-900" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
