import type { Session } from 'next-auth'
import { requireAdmin } from '@/lib/auth-guard'

/**
 * Single source of truth for admin-only gating inside the ingestion
 * domain. Every ingestion server action and route MUST route through
 * this helper instead of calling `requireAdmin` directly, so the
 * admin role check stays centralized.
 *
 * The admin surfaces are intentionally visible to admin roles during
 * internal development and demos. We still keep this helper so every
 * ingestion action can enforce the same role boundary in one place.
 */

export class IngestionFeatureUnavailableError extends Error {
  constructor() {
    super('Ingestion admin feature is not currently available.')
    this.name = 'IngestionFeatureUnavailableError'
  }
}

export async function requireIngestionAdmin(): Promise<Session> {
  return requireAdmin()
}
