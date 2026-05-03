import { getServerEnv } from '@/lib/env'

/**
 * Always-visible banner in staging deploys so contributors and testers
 * never confuse staging with production. Renders nothing in development
 * and production — zero cost when not in staging.
 *
 * Server component: reads APP_ENV at request time. No client JS shipped.
 */
export function StagingBanner() {
  if (getServerEnv().appEnv !== 'staging') return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] w-full bg-yellow-400 px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-black shadow"
    >
      Entorno de staging
    </div>
  )
}
