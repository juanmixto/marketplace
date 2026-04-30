import type PgBoss from 'pg-boss'
import { logger } from '@/lib/logger'

/**
 * Worker adapter for `image.prewarmVariants` (closes #1052, part of #1047).
 *
 * After a successful upload to blob storage, /api/upload enqueues a job
 * here so Next can render and cache the most common `(width, format)`
 * pairs from `/_next/image` BEFORE the first real client request hits
 * them. Without this, the first buyer who lands on a freshly published
 * product pays the full encode latency (~600-1200 ms on 4G) per photo.
 *
 * The job is deliberately:
 *   - **Idempotent**: re-running for the same URL is a no-op for Next's
 *     image cache. We do not track "already prewarmed" state.
 *   - **Non-blocking**: a failed prewarm is a log + metric, never a
 *     retry storm. The variant will be generated on demand on the
 *     first real request, which is the pre-#1052 baseline anyway.
 *   - **Cheap**: HEAD-style GET with `Accept: image/<format>` so each
 *     fan-out is a single render and no payload travels back to us.
 *
 * Configuration:
 *   - `IMAGE_PREWARM_ENABLED=true` toggles enqueue at the upload site.
 *   - `IMAGE_PREWARM_BASE_URL` overrides `NEXT_PUBLIC_APP_URL` if the
 *     internal worker needs to hit a different host (Vercel preview,
 *     internal tunnel, etc.). The job aborts if neither is set.
 */

export const PREWARM_IMAGE_VARIANTS_JOB = 'image.prewarmVariants' as const

export const DEFAULT_PREWARM_WIDTHS = [640, 1080, 1280] as const
export const DEFAULT_PREWARM_FORMATS = ['image/avif', 'image/webp'] as const
export const DEFAULT_PREWARM_QUALITY = 85

/**
 * Returns true iff the upload route should fire a prewarm enqueue.
 * Centralised so the route stays a one-liner and the gate is unit
 * testable without booting Next/auth/db.
 */
export function isImagePrewarmEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.IMAGE_PREWARM_ENABLED === 'true'
}

export interface PrewarmImageVariantsJobData {
  /** Public URL of the freshly uploaded image (Vercel Blob, etc.). */
  url: string
  /** Pixel widths to prewarm. Subset of next.config.ts deviceSizes. */
  widths?: number[]
  /** Accept header values, one render per format. */
  formats?: string[]
  /** Next image `q` parameter. We only prewarm one quality (the 4G one). */
  quality?: number
}

export interface PrewarmRequestPlan {
  width: number
  format: string
  url: string
  accept: string
}

export interface PrewarmResult {
  attempted: number
  succeeded: number
  failed: number
}

/**
 * Pure function: given a job payload + the resolved base URL, returns
 * the exact list of HTTP requests the handler will fire. Extracted so
 * unit tests can assert the fan-out without mocking fetch.
 */
export function planPrewarmRequests(
  data: PrewarmImageVariantsJobData,
  baseUrl: string,
): PrewarmRequestPlan[] {
  const widths = data.widths && data.widths.length > 0 ? data.widths : [...DEFAULT_PREWARM_WIDTHS]
  const formats = data.formats && data.formats.length > 0 ? data.formats : [...DEFAULT_PREWARM_FORMATS]
  const quality = typeof data.quality === 'number' ? data.quality : DEFAULT_PREWARM_QUALITY
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  const encoded = encodeURIComponent(data.url)

  const out: PrewarmRequestPlan[] = []
  for (const width of widths) {
    const url = `${trimmedBase}/_next/image?url=${encoded}&w=${width}&q=${quality}`
    for (const format of formats) {
      out.push({
        width,
        format,
        url,
        // Single-format Accept so the next/image handler picks the
        // exact codec we want, instead of negotiating.
        accept: `${format},*/*;q=0.8`,
      })
    }
  }
  return out
}

export function resolvePrewarmBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env.IMAGE_PREWARM_BASE_URL?.trim()
  if (explicit) return explicit
  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl) return appUrl
  return null
}

export interface PrewarmHandlerDeps {
  fetch: typeof fetch
  baseUrl: string
}

/**
 * Pure-deps handler so tests inject a fake fetch and a fake baseUrl
 * without having to wire `process.env`.
 */
export async function executePrewarm(
  data: PrewarmImageVariantsJobData,
  deps: PrewarmHandlerDeps,
): Promise<PrewarmResult> {
  const plan = planPrewarmRequests(data, deps.baseUrl)
  let succeeded = 0
  let failed = 0

  // Fan-out is small (default 6 requests = 3 widths × 2 formats) so
  // running them in parallel with Promise.allSettled is safe and keeps
  // total wall-time around a single render. We deliberately don't add
  // retries: if the first attempt times out, the variant will simply
  // be generated lazily on the first real client request — which is
  // the exact behaviour we have today without prewarming.
  const results = await Promise.allSettled(
    plan.map(async (entry) => {
      const res = await deps.fetch(entry.url, {
        method: 'GET',
        headers: { Accept: entry.accept },
        // No keep-alive across jobs; this is one-shot.
      })
      if (!res.ok) {
        throw new Error(`prewarm ${entry.format} w=${entry.width} returned ${res.status}`)
      }
      // Drain the body so Node frees the socket. We don't need the
      // bytes — `/_next/image` already cached the variant by the time
      // we got headers back.
      try {
        if (typeof (res as Response).arrayBuffer === 'function') {
          await (res as Response).arrayBuffer()
        }
      } catch {
        // ignore — body drain best-effort
      }
      return entry
    }),
  )

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const entry = plan[i]
    if (!r || !entry) continue
    if (r.status === 'fulfilled') {
      succeeded++
    } else {
      failed++
      const reason = r.reason as unknown
      logger.warn('photo.prewarm.variant_failed', {
        url: data.url,
        variantUrl: entry.url,
        format: entry.format,
        width: entry.width,
        error: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }

  return { attempted: plan.length, succeeded, failed }
}

/**
 * pg-boss handler. Resolves env-driven dependencies and delegates to
 * the pure executor. All logging happens here so the executor stays
 * trivially testable.
 */
export async function runPrewarmImageVariantsJob(
  job: PgBoss.Job<PrewarmImageVariantsJobData>,
): Promise<void> {
  const baseUrl = resolvePrewarmBaseUrl()
  if (!baseUrl) {
    logger.warn('photo.prewarm.skipped_no_base_url', {
      url: job.data.url,
      jobId: job.id,
    })
    return
  }

  const start = Date.now()
  let result: PrewarmResult
  try {
    result = await executePrewarm(job.data, { fetch, baseUrl })
  } catch (err) {
    logger.warn('photo.prewarm.failed', {
      url: job.data.url,
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  logger.info('photo.prewarm.completed', {
    url: job.data.url,
    jobId: job.id,
    durationMs: Date.now() - start,
    attempted: result.attempted,
    succeeded: result.succeeded,
    failed: result.failed,
  })
}
