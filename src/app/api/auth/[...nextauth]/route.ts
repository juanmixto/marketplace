import { handlers as nextAuthHandlers } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIP } from '@/lib/ratelimit'

/**
 * NextAuth has built-in handlers for GET/POST to /api/auth/[...nextauth]
 * We wrap the POST handler to add rate limiting for login attempts
 */
export const GET = nextAuthHandlers.GET

export async function POST(req: NextRequest) {
  // Check if this is a signin request (NextAuth uses query params)
  const url = new URL(req.url)
  const isSignIn = url.pathname.includes('signin')

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

  // Pass through to NextAuth handler
  return nextAuthHandlers.POST(req)
}
