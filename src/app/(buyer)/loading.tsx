/**
 * Route-group skeleton shown while a (buyer) page awaits its server data.
 * Without this file, navigating between authenticated buyer pages leaves
 * the previous page frozen on screen until the next layout finishes — the
 * main contributor to the "la app va lenta" perception even when the
 * server response is actually quick.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-1/3 rounded bg-emerald-100 dark:bg-emerald-900/40" />
        <div className="h-4 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-64 w-full rounded-xl bg-neutral-100 dark:bg-neutral-900" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-32 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          <div className="h-32 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          <div className="h-32 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
        </div>
      </div>
    </main>
  )
}
