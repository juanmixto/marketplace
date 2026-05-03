/**
 * Rate limiting utility for authentication and abuse-sensitive endpoints
 *
 * Two storage modes:
 * - Development: in-memory store (no external dependencies)
 * - Production:  Upstash Redis (when UPSTASH_REDIS_REST_URL is set)
 *
 * Two security knobs (#172):
 * - Trusted-proxy gating: forwarded headers are only honored when the
 *   deployment is explicitly behind a proxy we trust. Otherwise we refuse
 *   to identify the client by what the client sent us, because anything
 *   else lets a single attacker rotate `X-Forwarded-For` and bypass
 *   per-IP limits trivially.
 * - Fail-closed mode: callers that protect critical surfaces (auth,
 *   recovery) ask for `failClosed: true`. When the backend rate-limit
 *   store is unreachable or returns garbage, those callers get
 *   `success: false` instead of an open door.
 */

import { getServerEnv } from '@/lib/env'
import { fetchWithTimeout, FetchTimeoutError } from '@/lib/fetch-with-timeout'
import { logger } from '@/lib/logger'

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store: key -> { count, resetAt }
const inMemoryStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.resetAt < now) {
      inMemoryStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

cleanupInterval.unref?.()

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  message?: string
  /** True when this result came from a fail-mode degradation (open or closed). */
  degraded?: boolean
}

export interface RateLimitOptions {
  /**
   * When true, a backend failure (Upstash unreachable, malformed response,
   * thrown fetch) returns `success: false` instead of allowing the request.
   * Use this for auth and recovery surfaces.
   */
  failClosed?: boolean
}

function logEvent(event: string, payload: Record<string, unknown>): void {
  // Route through the structured logger so the same scope/context shape
  // applies as everywhere else. Severity follows the existing convention:
  // ":error" / ":fail-closed" suffixes are errors, the rest are warnings.
  const scope = `ratelimit.${event.replace(/:/g, '.')}`
  if (event.endsWith(':error') || event.endsWith(':fail-closed')) {
    logger.error(scope, payload)
  } else {
    logger.warn(scope, payload)
  }
}

/**
 * Check rate limit for an action.
 */
export async function checkRateLimit(
  action: string,
  key: string,
  limit: number,
  windowSeconds: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  // Strip port from IPv6 addresses for cleaner keys
  const cleanKey = key.replace(/\[.*\]/, '').replace(/:\d+$/, '')
  const limitKey = `${action}:${cleanKey}`
  const now = Date.now()

  if (getServerEnv().upstashRedisRestUrl) {
    return checkRateLimitUpstash(action, limitKey, limit, windowSeconds, now, options)
  }

  return checkRateLimitMemory(limitKey, limit, windowSeconds, now)
}

/**
 * In-memory rate limiting (development / single-process fallback)
 */
function checkRateLimitMemory(
  limitKey: string,
  limit: number,
  windowSeconds: number,
  now: number
): RateLimitResult {
  const entry = inMemoryStore.get(limitKey)
  const resetAt = now + windowSeconds * 1000

  if (!entry || entry.resetAt < now) {
    inMemoryStore.set(limitKey, { count: 1, resetAt })
    return {
      success: true,
      remaining: limit - 1,
      resetAt,
    }
  }

  entry.count++

  if (entry.count > limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      message: `Demasiados intentos. Intenta de nuevo en ${Math.ceil((entry.resetAt - now) / 1000)} segundos.`,
    }
  }

  return {
    success: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Apply degraded behavior when the Upstash backend is unusable.
 *
 * - failClosed: deny the request and surface a friendly message.
 * - default:    fall back to the in-process counter so we still apply
 *               *some* throttling per Node instance instead of allowing
 *               unlimited traffic.
 */
function degrade(
  reason: string,
  limitKey: string,
  limit: number,
  windowSeconds: number,
  now: number,
  options: RateLimitOptions
): RateLimitResult {
  if (options.failClosed) {
    logEvent('degraded:fail-closed', { reason, key: limitKey })
    return {
      success: false,
      remaining: 0,
      resetAt: now + windowSeconds * 1000,
      message: 'Servicio temporalmente no disponible. Inténtalo de nuevo en unos minutos.',
      degraded: true,
    }
  }

  logEvent('degraded:fallback-memory', { reason, key: limitKey })
  const result = checkRateLimitMemory(limitKey, limit, windowSeconds, now)
  return { ...result, degraded: true }
}

/**
 * Redis-based rate limiting (production with Upstash)
 */
async function checkRateLimitUpstash(
  action: string,
  limitKey: string,
  limit: number,
  windowSeconds: number,
  now: number,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const env = getServerEnv()
  try {
    // 3s timeout — rate-limit checks are in the hot path; if Upstash is
    // slow we'd rather degrade to in-memory limits than block the request.
    const response = await fetchWithTimeout(
      `${env.upstashRedisRestUrl}/incr/${limitKey}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.upstashRedisRestToken}`,
          'Content-Type': 'application/json',
        },
        timeoutMs: 3_000,
      }
    )

    if (!response.ok) {
      logEvent('upstash:error', { action, key: limitKey, status: response.status })
      return degrade(`upstash-status-${response.status}`, limitKey, limit, windowSeconds, now, options)
    }

    const payload = await response.json().catch(() => null)
    const rawResult = payload?.result
    const count = typeof rawResult === 'number' ? rawResult : parseInt(String(rawResult ?? ''), 10)

    if (!Number.isFinite(count)) {
      logEvent('upstash:malformed', { action, key: limitKey, raw: rawResult })
      return degrade('upstash-malformed', limitKey, limit, windowSeconds, now, options)
    }

    // Set expiry on first request. Fire-and-forget: if Upstash is
    // slow here it just means the key may not have a TTL set this
    // tick (it'll be set on the next request). Don't block.
    if (count === 1) {
      await fetchWithTimeout(
        `${env.upstashRedisRestUrl}/expire/${limitKey}/${windowSeconds}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.upstashRedisRestToken}`,
          },
          timeoutMs: 2_000,
        }
      ).catch(() => undefined)
    }

    const resetAt = now + windowSeconds * 1000

    if (count > limit) {
      return {
        success: false,
        remaining: 0,
        resetAt,
        message: `Demasiados intentos. Intenta de nuevo en ${windowSeconds} segundos.`,
      }
    }

    return {
      success: true,
      remaining: limit - count,
      resetAt,
    }
  } catch (error) {
    // Distinguish a clean timeout from a generic throw so on-call can
    // decide whether to scale Upstash or chase a code regression.
    const reason =
      error instanceof FetchTimeoutError ? 'upstash-timeout' : 'upstash-throw'
    logEvent('upstash:error', { action, key: limitKey, error: (error as Error)?.message, reason })
    return degrade(reason, limitKey, limit, windowSeconds, now, options)
  }
}

export interface ResolveClientIpOptions {
  /**
   * Override automatic trust detection. Default: trust proxy headers only
   * when running on a known managed platform (Vercel) or when
   * `TRUST_PROXY_HEADERS=true` is set explicitly.
   */
  trustProxy?: boolean
}

const UNTRUSTED_CLIENT_KEY = 'untrusted-client'

function isProxyTrustedFromEnv(): boolean {
  if (process.env.TRUST_PROXY_HEADERS === 'true') return true
  if (process.env.TRUST_PROXY_HEADERS === 'false') return false
  // Vercel always sits in front of the function and strips client-supplied
  // x-forwarded-for, so its value can be trusted.
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') return true
  return false
}

/**
 * Resolve the client IP for rate limiting purposes.
 *
 * Returns a stable sentinel (`untrusted-client`) when the deployment is not
 * behind a proxy we trust. That sentinel is intentional: it groups every
 * request from an unconfigured deployment into one bucket so an attacker
 * cannot evade limits by spoofing headers, while still keeping per-action
 * counters working. Configure `TRUST_PROXY_HEADERS=true` (or deploy to
 * Vercel) to opt into per-IP limits.
 */
export function getClientIP(request: Request, options: ResolveClientIpOptions = {}): string {
  const trustProxy = options.trustProxy ?? isProxyTrustedFromEnv()

  if (!trustProxy) {
    if (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')) {
      logEvent('untrusted-header-ignored', {
        forwarded: request.headers.get('x-forwarded-for') ?? null,
        realIp: request.headers.get('x-real-ip') ?? null,
      })
    }
    return UNTRUSTED_CLIENT_KEY
  }

  // Cloudflare always sends cf-connecting-ip with the originating client IP
  // and strips any client-supplied copy of the header (#540). Preferred over
  // x-forwarded-for because behind Cloudflare → Traefik the XFF chain is
  // ["client", "cf-edge-ip"] and the leftmost entry can be spoofed if
  // Cloudflare is bypassed via the origin IP. Keep x-forwarded-for only for
  // non-Cloudflare deployments (Vercel, local Docker behind nginx).
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp.trim()

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]!.trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

  return '127.0.0.1'
}
