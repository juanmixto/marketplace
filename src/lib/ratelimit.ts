/**
 * Rate limiting utility for authentication endpoints
 *
 * Supports two modes:
 * - Development: In-memory store (no external dependencies)
 * - Production: Upstash Redis (requires UPSTASH_REDIS_REST_URL)
 *
 * Usage:
 *   const result = await checkRateLimit('register', clientIp, 3, 3600)
 *   if (!result.success) return NextResponse.json({ error: result.message }, { status: 429 })
 */

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
}

/**
 * Check rate limit for an action.
 *
 * @param action - Action identifier (e.g., 'register', 'login')
 * @param key - Identifier to rate limit by (usually IP address)
 * @param limit - Max attempts allowed in window
 * @param windowSeconds - Time window in seconds
 * @returns Result with success flag and reset timestamp
 */
export async function checkRateLimit(
  action: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  // Strip port from IPv6 addresses for cleaner keys
  const cleanKey = key.replace(/\[.*\]/, '').replace(/:\d+$/, '')
  const limitKey = `${action}:${cleanKey}`
  const now = Date.now()
  const resetAt = now + windowSeconds * 1000

  // Try to use Upstash Redis if available
  if (process.env.UPSTASH_REDIS_REST_URL) {
    return checkRateLimitUpstash(limitKey, limit, windowSeconds, now)
  }

  // Fall back to in-memory store for development
  return checkRateLimitMemory(limitKey, limit, windowSeconds, now)
}

/**
 * In-memory rate limiting (development)
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
    // First attempt or window expired
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
 * Redis-based rate limiting (production with Upstash)
 */
async function checkRateLimitUpstash(
  limitKey: string,
  limit: number,
  windowSeconds: number,
  now: number
): Promise<RateLimitResult> {
  try {
    const response = await fetch(
      `${process.env.UPSTASH_REDIS_REST_URL}/incr/${limitKey}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('[ratelimit] Upstash error:', response.status)
      // Fail open - allow request if Redis is down
      return { success: true, remaining: limit, resetAt: now + windowSeconds * 1000 }
    }

    const { result } = await response.json()
    const count = parseInt(result)

    // Set expiry on first request
    if (count === 1) {
      await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/expire/${limitKey}/${windowSeconds}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          },
        }
      )
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
    console.error('[ratelimit] Error:', error)
    // Fail open - allow request if Redis is unreachable
    return { success: true, remaining: limit, resetAt: now + windowSeconds * 1000 }
  }
}

/**
 * Extract client IP address from request headers
 * Respects X-Forwarded-For when behind a proxy
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs; use the first one
    return forwarded.split(',')[0].trim()
  }

  return request.headers.get('x-real-ip') ?? '127.0.0.1'
}
