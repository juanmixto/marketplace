import { type NextRequest } from 'next/server'
import { isMockOAuthEnabled } from '@/lib/auth-mock-oauth'
import { getMockEntry } from '@/lib/auth-mock-oauth-store'

/**
 * Test-only OAuth token endpoint. NextAuth POSTs the code from the
 * authorize step; we return the same code as access_token. The
 * /userinfo handler looks the entry up by access_token. Code TTL
 * is enforced by the store.
 */
export async function POST(req: NextRequest) {
  if (!isMockOAuthEnabled()) {
    return new Response(null, { status: 404 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let code: string | null = null
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await req.formData()
    code = (body.get('code') as string | null) ?? null
  } else if (contentType.includes('application/json')) {
    const body = (await req.json()) as { code?: string }
    code = body.code ?? null
  }

  if (!code) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }

  const entry = getMockEntry(code)
  if (!entry) {
    return Response.json({ error: 'invalid_grant' }, { status: 400 })
  }

  return Response.json({
    access_token: code,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid email profile',
  })
}
