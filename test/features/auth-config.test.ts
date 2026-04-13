import test from 'node:test'
import assert from 'node:assert/strict'
import { authConfig } from '@/lib/auth-config'
import { UserRole } from '@/generated/prisma/enums'

const callbacks = authConfig.callbacks!
type AuthorizedParams = Parameters<NonNullable<typeof callbacks.authorized>>[0]
type JwtParams = Parameters<NonNullable<typeof callbacks.jwt>>[0]
type SessionParams = Parameters<NonNullable<typeof callbacks.session>>[0]

function buildAuthorizedParams(pathname: string, role?: UserRole): AuthorizedParams {
  return {
    auth: role
      ? {
          expires: new Date('2026-04-08').toISOString(),
          user: {
            id: 'user_123',
            email: 'user@marketplace.com',
            name: 'Demo User',
            role,
          },
        }
      : null,
    request: {
      nextUrl: new URL(`http://localhost:3000${pathname}`),
    } as AuthorizedParams['request'],
  } as AuthorizedParams
}

test('authorized allows public routes without authentication', () => {
  const allowed = callbacks.authorized!(buildAuthorizedParams('/'))

  assert.equal(allowed, true)
})

test('authorized blocks buyer routes for anonymous users', () => {
  const allowed = callbacks.authorized!(buildAuthorizedParams('/checkout'))

  assert.equal(allowed, false)
})

test('authorized allows vendors into vendor routes and blocks non vendors', () => {
  const vendorAllowed = callbacks.authorized!(buildAuthorizedParams('/vendor/dashboard', 'VENDOR'))

  const customerAllowed = callbacks.authorized!(buildAuthorizedParams('/vendor/dashboard', 'CUSTOMER'))

  assert.equal(vendorAllowed, true)
  assert.equal(customerAllowed, false)
})

test('authorized restricts admin routes to admin roles', () => {
  const adminAllowed = callbacks.authorized!(buildAuthorizedParams('/admin/dashboard', 'ADMIN_FINANCE'))
  const opsAllowed = callbacks.authorized!(buildAuthorizedParams('/admin/dashboard', 'ADMIN_OPS'))

  const vendorAllowed = callbacks.authorized!(buildAuthorizedParams('/admin/dashboard', 'VENDOR'))

  assert.equal(adminAllowed, true)
  assert.equal(opsAllowed, true)
  assert.equal(vendorAllowed, false)
})

test('jwt callback persists id and role onto the token', async () => {
  const token = await callbacks.jwt!({
    token: {} as JwtParams['token'],
    user: {
      id: 'user_123',
      email: 'admin@marketplace.com',
      name: 'Admin',
      role: 'SUPERADMIN',
    } as JwtParams['user'],
  })

  assert.ok(token)
  assert.equal(token.id, 'user_123')
  assert.equal(token.role, 'SUPERADMIN')
})

test('session callback copies token identity onto the session user', async () => {
  const session = await callbacks.session!({
    session: {
      user: {
        id: 'user_123',
        email: 'admin@marketplace.com',
        name: 'Admin',
        role: 'CUSTOMER',
      },
      expires: new Date('2026-04-08').toISOString(),
    } as SessionParams['session'],
    token: {
      id: 'user_123',
      role: 'ADMIN_OPS',
    } as SessionParams['token'],
  } as SessionParams)

  assert.ok(session.user)
  assert.equal(session.user.id, 'user_123')
  assert.equal(session.user.role, 'ADMIN_OPS')
})
