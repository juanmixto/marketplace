export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-40 rounded bg-emerald-100 dark:bg-emerald-900/40" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="h-20 w-20 shrink-0 rounded-lg bg-neutral-100 dark:bg-neutral-900" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-8 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-64 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="space-y-3">
              <div className="h-4 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-3 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-10 w-full rounded bg-emerald-100 dark:bg-emerald-900/40" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
