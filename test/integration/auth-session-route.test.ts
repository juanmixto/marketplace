import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'

test('GET /api/auth/session reads secure cookies when the public host is https', async () => {
  const now = Math.floor(Date.now() / 1000)
  const secret = process.env.AUTH_SECRET ?? 'dev-secret-change-in-production-abc123xyz'
  const previousSecret = process.env.AUTH_SECRET
  const previousDatabaseUrl = process.env.DATABASE_URL
  const previousAuthUrl = process.env.AUTH_URL
  const previousNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL
  const previousNextAuthUrl = process.env.NEXTAUTH_URL
  process.env.AUTH_SECRET = secret
  process.env.DATABASE_URL ??= 'postgresql://mp_user:mp_pass@localhost:55432/marketplace_test'
  process.env.AUTH_URL = 'https://dev.feldescloud.com'
  process.env.NEXT_PUBLIC_APP_URL = 'https://dev.feldescloud.com'
  process.env.NEXTAUTH_URL = 'https://dev.feldescloud.com'
  try {
    const { handlers } = await import('@/lib/auth')
    const token = await encode({
      token: {
        id: 'user_123',
        role: 'SUPERADMIN',
        email: 'admin@marketplace.com',
        name: 'Admin',
        sub: 'user_123',
        iat: now,
        exp: now + 3600,
      },
      secret,
      salt: '__Secure-authjs.session-token',
    })

    const req = new NextRequest('http://localhost:3001/api/auth/session', {
      headers: {
        host: 'dev.feldescloud.com',
        cookie: `__Secure-authjs.session-token=${token}`,
      },
    })

    const res = await handlers.GET(req)
    assert.equal(res.status, 200)

    const body = (await res.json()) as {
      user?: {
        id?: string
        role?: string
        isActive?: boolean
        authVersion?: number
        has2fa?: boolean
      }
      expires?: string
    } | null

    assert.ok(body)
    assert.equal(body?.user?.id, 'user_123')
    assert.equal(body?.user?.role, 'SUPERADMIN')
    assert.equal(body?.user?.isActive, true)
    assert.equal(body?.user?.authVersion, 0)
    assert.equal(body?.user?.has2fa, false)
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
    if (previousAuthUrl === undefined) delete process.env.AUTH_URL
    else process.env.AUTH_URL = previousAuthUrl
    if (previousNextPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previousNextPublicAppUrl
    if (previousNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = previousNextAuthUrl
  }
})
