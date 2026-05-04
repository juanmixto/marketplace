/**
 * Server-side PostHog wrapper (#1215).
 *
 * The client wrapper (`src/lib/analytics.ts` → `src/lib/posthog.ts`) emits
 * from the browser. That's correct for UX events (`product.viewed`,
 * `cart.opened`) but loses the funnel-critical events that happen in
 * server actions or webhook handlers — if the buyer closes the tab the
 * instant their `order.placed` confirmation page starts to render, the
 * client-side `posthog.capture` never fires and the conversion vanishes
 * from the funnel.
 *
 * This module fires the same events from Node — directly to PostHog's
 * `/i/v0/e/` endpoint via the official `posthog-node` SDK. Three
 * properties are bolted on automatically:
 *
 *   - `$insert_id`         server-side dedupe; PostHog drops duplicates
 *                          within ~24 h. Derived from `dedupeKey` so a
 *                          retry of the same server action emits the
 *                          same id.
 *   - `app_env`            mirrors the client wrapper so the staging /
 *                          production split stays consistent across
 *                          dashboards.
 *   - `correlationId`      pulled from AsyncLocalStorage when present
 *                          (#1210). Lets oncall pivot from a PostHog
 *                          event to logs / Sentry without a manual id
 *                          translation.
 *
 * Lifecycle: the SDK client is lazy-initialised on the first call and
 * cached as a process-wide singleton. `flushServerAnalytics()` drains
 * pending batches; the helper is wired into `process.on('beforeExit')`
 * (best-effort: in serverless edge runtimes the process can be killed
 * without `beforeExit` firing, which is exactly what dedupe + the
 * SDK's batched POST were designed to tolerate).
 *
 * Fail-quiet by design — analytics must never tumble checkout. Every
 * surface returns synchronously and swallows errors after logging
 * them under `analytics.server.*`.
 */
import { PostHog } from 'posthog-node'
import { logger } from '@/lib/logger'
import { getCorrelationId } from '@/lib/correlation-context'

interface ServerTrackOptions {
  /**
   * Stable id this event is associated with. For authenticated buyers
   * that's the User.id; for anonymous order flows we fall back to
   * `${order_id}` so the events still group cleanly per order.
   */
  distinctId: string
  /**
   * Idempotency seed. The wrapper hashes `${event}:${dedupeKey}` into
   * `$insert_id`, which PostHog uses to drop duplicates within its
   * server-side dedupe window. If absent, every call emits a fresh id
   * (callers that retry would double-count — only safe for events that
   * are inherently once-per-call).
   */
  dedupeKey?: string
}

let cached: PostHog | null = null
let beforeExitHooked = false

function getApiKey(): string | null {
  // Server-side reads the public key intentionally: PostHog's capture
  // endpoint accepts the project's "public" project API key (no
  // separate server token). The personal API key only matters for
  // local flag evaluation, which is a separate concern.
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  return key && key.length > 0 ? key : null
}

function getApiHost(): string {
  // Mirrors `src/lib/posthog.ts::getApiHost`. Production routes through
  // a Cloudflare Worker so ad-blockers don't drop events; dev/staging
  // hit `eu.i.posthog.com` directly.
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'
}

function getAppEnv(): string {
  // Server reads APP_ENV (server var); browser reads NEXT_PUBLIC_APP_ENV.
  // They must match — `audit-app-env-coherence.mjs` enforces it.
  return process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || 'development'
}

function getClient(): PostHog | null {
  if (cached) return cached
  const key = getApiKey()
  if (!key) return null
  try {
    cached = new PostHog(key, {
      host: getApiHost(),
      // Small batches + short interval keeps order events near-real-time
      // in dashboards without flooding the wire on bursty workers.
      flushAt: 10,
      flushInterval: 2_000,
      // The SDK can call back to the project for feature-flag eval; we
      // don't need it server-side here (we have flags.ts), and
      // disabling avoids a startup network round-trip.
      disableGeoip: false,
    })
    if (!beforeExitHooked) {
      // Drain pending batches when the process is winding down. Best
      // effort: edge / hard-killed processes won't fire this, which is
      // why $insert_id is the primary dedupe.
      process.on('beforeExit', () => {
        flushServerAnalytics().catch(() => {
          // Already logged inside flushServerAnalytics
        })
      })
      beforeExitHooked = true
    }
  } catch (err) {
    logger.error('analytics.server.init_failed', { error: err })
    return null
  }
  return cached
}

/**
 * Fire a PostHog event from server code. Returns synchronously; the
 * SDK batches and sends in the background.
 */
export function trackServer(
  event: string,
  properties: Record<string, unknown>,
  options: ServerTrackOptions,
): void {
  const client = getClient()
  if (!client) return // PostHog disabled (no key) — silently no-op

  try {
    const insertId = options.dedupeKey ? `${event}:${options.dedupeKey}` : undefined
    const correlationId = getCorrelationId()

    client.capture({
      distinctId: options.distinctId,
      event,
      properties: {
        ...properties,
        app_env: getAppEnv(),
        ...(correlationId ? { correlationId } : {}),
        ...(insertId ? { $insert_id: insertId } : {}),
      },
    })
  } catch (err) {
    // Never throw out of an analytics path; log and move on.
    logger.warn('analytics.server.capture_failed', {
      event,
      distinctId: options.distinctId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Drain pending events. Callers in long-lived workers should call this
 * after a unit of work; request-scoped Next handlers can rely on
 * `beforeExit` (good-citizen) plus `$insert_id` (defense in depth).
 */
export async function flushServerAnalytics(): Promise<void> {
  if (!cached) return
  try {
    await cached.flush()
  } catch (err) {
    logger.warn('analytics.server.flush_failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Test-only: drop the cached client so process.env overrides take
 * effect on the next `getClient()` call.
 */
export function __resetServerAnalyticsForTests(): void {
  if (cached) {
    void cached.shutdown().catch(() => {
      // Ignore shutdown noise in test teardown
    })
  }
  cached = null
  beforeExitHooked = false
}

/**
 * Test-only: inject a stub PostHog client so unit tests don't need to
 * mock the whole `posthog-node` module (require.cache surgery is not
 * ESM-safe under tsx, and the SDK's open network port fights the test
 * runner's clean exit). The stub only needs to implement `capture`,
 * `flush`, and `shutdown`.
 */
export function __setClientForTests(stub: unknown): void {
  cached = stub as PostHog
  beforeExitHooked = true
}
