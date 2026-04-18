import { handlers as nextAuthHandlers } from '@/lib/auth'
import { reqWithHostHeader } from '@/lib/auth-host'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

/**
 * NextAuth has built-in handlers for GET/POST to /api/auth/[...nextauth]
 * We wrap the POST handler to add rate limiting for login attempts
 */
export function GET(req: NextRequest) {
  return nextAuthHandlers.GET(reqWithHostHeader(req))
}

export async function POST(req: NextRequest) {
  // Credential sign-in posts to /callback/credentials in NextAuth v5.
  // OAuth/email sign-ins use /signin/*; rate-limit both entry points.
  const url = new URL(req.url)
  const isSignIn = url.pathname.includes('/signin/') || url.pathname.includes('/callback/')

  if (isSignIn) {
    const clientIP = getClientIP(req)
    // 5 login attempts per IP per 15 minutes; auth surface → fail-closed.
    const rateLimitResult = await checkRateLimit('login', clientIP, 5, 900, { failClosed: true })

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: rateLimitResult.message },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetAt.toString(),
          },
        }
      )
    }
  }

  return nextAuthHandlers.POST(reqWithHostHeader(req))
}
