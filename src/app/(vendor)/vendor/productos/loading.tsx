/**
 * Products skeleton: heading + "Add" CTA + grid of product cards.
 * Each card mirrors the real catalog item: image, name, price, status badge.
 */
export default function Loading() {
  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-1/4 rounded bg-emerald-100 dark:bg-emerald-900/40" />
          <div className="h-10 w-32 rounded-lg bg-emerald-100 dark:bg-emerald-900/40" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <div className="aspect-square w-full bg-neutral-100 dark:bg-neutral-900" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="flex items-center justify-between">
                  <div className="h-5 w-16 rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-5 w-16 rounded-full bg-neutral-100 dark:bg-neutral-900" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
