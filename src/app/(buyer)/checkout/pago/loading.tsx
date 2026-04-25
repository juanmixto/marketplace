export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="h-10 w-full rounded-2xl bg-neutral-100 dark:bg-neutral-900" />
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-8 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-8 rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-8 rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        </div>
        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="h-7 w-1/3 rounded bg-emerald-100 dark:bg-emerald-900/40" />
          <div className="h-80 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          <div className="flex items-center justify-end">
            <div className="h-11 w-40 rounded-lg bg-emerald-100 dark:bg-emerald-900/40" />
          </div>
        </div>
      </div>
    </div>
  )
}
