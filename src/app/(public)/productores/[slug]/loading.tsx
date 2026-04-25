export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="h-56 w-full rounded-3xl bg-neutral-100 dark:bg-neutral-900" />
        <div className="space-y-3">
          <div className="h-8 w-1/2 rounded bg-emerald-100 dark:bg-emerald-900/40" />
          <div className="h-4 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="aspect-square bg-neutral-100 dark:bg-neutral-900" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-5 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
