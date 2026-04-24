/**
 * Route-group skeleton shown while an (admin) page awaits its server data.
 * Admin dashboards frequently issue heavy aggregate queries; without a
 * fallback, navigation feels frozen. The skeleton mirrors the common
 * "title + KPI cards + table" shape of admin pages.
 */
export default function Loading() {
  return (
    <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-6">
        <div className="h-7 w-1/4 rounded bg-emerald-100 dark:bg-emerald-900/40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-24 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          <div className="h-24 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          <div className="h-24 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
          <div className="h-24 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
        </div>
        <div className="h-96 w-full rounded-xl bg-neutral-100 dark:bg-neutral-900" />
      </div>
    </div>
  )
}
