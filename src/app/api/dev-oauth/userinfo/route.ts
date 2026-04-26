import { type NextRequest } from 'next/server'
import { isMockOAuthEnabled } from '@/lib/auth-mock-oauth'
import { getMockEntry } from '@/lib/auth-mock-oauth-store'

/**
 * Test-only OAuth userinfo endpoint. NextAuth fetches this with the
 * Bearer access_token from /token; we look up the entry and return a
 * Google-shaped profile. Splitting `name` into first/last is the
 * adapter's job (see splitProfileName in src/lib/auth-profile-name.ts).
 */
export async function GET(req: NextRequest) {
  if (!isMockOAuthEnabled()) {
    return new Response(null, { status: 404 })
  }

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ')
    ? auth.slice(7).trim()
    : null
  if (!token) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const entry = getMockEntry(token)
  if (!entry) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }

  // Split name once here too so the userinfo response matches what
  // Google emits in shape; the adapter still normalizes via
  // splitProfileName for safety.
  const [given_name = '', ...rest] = entry.name.trim().split(/\s+/)
  const family_name = rest.join(' ')

  return Response.json({
    sub: entry.sub,
    email: entry.email,
    email_verified: true,
    name: entry.name,
    given_name,
    family_name,
    picture: null,
  })
}
