export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="h-9 w-64 rounded bg-emerald-100 dark:bg-emerald-900/40" />
        <div className="h-4 w-96 max-w-full rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="h-44 bg-neutral-100 dark:bg-neutral-900" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-3 w-5/6 rounded bg-neutral-200 dark:bg-neutral-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
