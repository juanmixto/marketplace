import { handlers as nextAuthHandlers } from '@/lib/auth'
import { reqWithHostHeader } from '@/lib/auth-host'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'
import { normalizeAuthEmail } from '@/lib/auth-email'

/**
 * NextAuth has built-in handlers for GET/POST to /api/auth/[...nextauth]
 * We wrap the POST handler to add rate limiting for login attempts
 */
export function GET(req: NextRequest) {
  return nextAuthHandlers.GET(reqWithHostHeader(req))
}

export async function POST(req: NextRequest) {
  // Check if this is a signin request (NextAuth uses query params)
  const url = new URL(req.url)
  const isSignIn = url.pathname.includes('/signin/') || url.pathname.includes('/callback/')

  if (isSignIn) {
    // Escape hatch for E2E / Playwright suites. CI shares a single
    // seeded credential across ~20 login attempts in a suite and
    // quickly exhausts the (IP+email) bucket, turning the rate limit
    // into a deterministic suite-killer. The flag is gated to non-
    // production NODE_ENV so a prod deploy cannot silently bypass
    // the limit even if the env var leaks.
    if (
      process.env.NODE_ENV !== 'production'
      && process.env.DISABLE_LOGIN_RATELIMIT === '1'
    ) {
      return nextAuthHandlers.POST(reqWithHostHeader(req))
    }

    const clientIP = getClientIP(req)
    const loginKey = await resolveLoginThrottleKey(req, clientIP, url.pathname)
    // 10 login attempts per identity/IP bucket per 15 minutes; auth surface → fail-closed.
    const rateLimitResult = await checkRateLimit('login', loginKey, 10, 900, { failClosed: true })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: rateLimitResult.message },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      )
    }
  }

  return nextAuthHandlers.POST(reqWithHostHeader(req))
}

async function resolveLoginThrottleKey(req: NextRequest, clientIP: string, pathname: string) {
  if (!pathname.includes('/callback/')) {
    return clientIP
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return clientIP
  }

  const formData = await req.clone().formData().catch(() => null)
  const email = formData?.get('email')

  if (typeof email !== 'string') {
    return clientIP
  }

  const normalizedEmail = normalizeAuthEmail(email)
  if (!normalizedEmail) {
    return clientIP
  }

  return `${clientIP}:${normalizedEmail}`
}
