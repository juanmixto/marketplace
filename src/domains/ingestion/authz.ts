import type { Session } from 'next-auth'
import { requireAdmin } from '@/lib/auth-guard'
import { isIngestionAdminEnabled } from '@/domains/ingestion/flags'

/**
 * Single source of truth for admin-only gating inside the ingestion
 * domain. Every ingestion server action and route MUST route through
 * this helper instead of calling `requireAdmin` directly, so the
 * feature-flag check cannot be accidentally skipped.
 *
 * Combines (in order):
 *   1. `requireAdmin()` — redirects to `/` if the caller is not an
 *      admin role, mirroring the repo convention.
 *   2. `feat-ingestion-admin` PostHog gate — returns a neutral
 *      `FeatureUnavailableError` when the flag is off, which callers
 *      surface to the UI as a generic "not available" state rather
 *      than leaking the existence of the subsystem pre-GA.
 *
 * The flag check is intentionally AFTER the role check so non-admins
 * never get to observe whether the flag is flipped for anyone.
 */

export class IngestionFeatureUnavailableError extends Error {
  constructor() {
    super('Ingestion admin feature is not currently available.')
    this.name = 'IngestionFeatureUnavailableError'
  }
}

export async function requireIngestionAdmin(): Promise<Session> {
  const session = await requireAdmin()
  const enabled = await isIngestionAdminEnabled({
    userId: session.user.id,
    email: session.user.email ?? undefined,
    role: session.user.role,
  })
  if (!enabled) throw new IngestionFeatureUnavailableError()
  return session
}
