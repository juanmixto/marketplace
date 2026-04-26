import { NextResponse, type NextRequest } from 'next/server'
import {
  isMockOAuthEnabled,
  MOCK_OAUTH_USER_COOKIE,
} from '@/lib/auth-mock-oauth'
import { generateMockCode, putMockEntry } from '@/lib/auth-mock-oauth-store'

interface MockUserCookie {
  email: string
  name?: string
  sub?: string
}

/**
 * Test-only OAuth authorization endpoint. Reads the user from a cookie
 * the test seed sets, generates a code keyed to that user, redirects
 * back to NextAuth's callback. 404 in production / when the env flag
 * is unset — defense in depth on top of the file path itself living
 * under /api/__test__/.
 */
export async function GET(req: NextRequest) {
  if (!isMockOAuthEnabled()) {
    return new Response(null, { status: 404 })
  }

  const url = new URL(req.url)
  const redirectUri = url.searchParams.get('redirect_uri')
  // `state` is only present when provider.checks includes 'state'.
  // Our mock provider uses checks: ['none'] (see auth-mock-oauth.ts)
  // so Auth.js doesn't add it to the authorize URL. Forward it back
  // when present, omit otherwise.
  const state = url.searchParams.get('state')
  if (!redirectUri) {
    return new Response('missing redirect_uri', { status: 400 })
  }

  const cookie = req.cookies.get(MOCK_OAUTH_USER_COOKIE)?.value
  let user: MockUserCookie
  try {
    user = cookie
      ? (JSON.parse(decodeURIComponent(cookie)) as MockUserCookie)
      : { email: 'mock-anon@test.invalid', name: 'Mock Anon' }
  } catch {
    return new Response('invalid mock user cookie', { status: 400 })
  }

  if (!user.email) {
    return new Response('mock user cookie missing email', { status: 400 })
  }

  const code = generateMockCode()
  putMockEntry(code, {
    email: user.email,
    name: user.name ?? 'Mock User',
    sub: user.sub ?? `mock-${user.email}`,
  })

  const target = new URL(redirectUri)
  target.searchParams.set('code', code)
  if (state) target.searchParams.set('state', state)
  return NextResponse.redirect(target.toString(), 302)
}
