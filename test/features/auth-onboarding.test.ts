import test from 'node:test'
import assert from 'node:assert/strict'
import { authConfig } from '@/lib/auth-config'

const callbacks = authConfig.callbacks!
type JwtParams = Parameters<NonNullable<typeof callbacks.jwt>>[0]
type SessionParams = Parameters<NonNullable<typeof callbacks.session>>[0]

function jwtParams(user: Record<string, unknown> | null): JwtParams {
  return {
    token: {},
    user: user as JwtParams['user'],
    trigger: 'signIn' as const,
    isNewUser: false,
    session: undefined,
    account: null,
  } as JwtParams
}

test('jwt: needsOnboarding from user object propagates to token', async () => {
  const result = await callbacks.jwt!(
    jwtParams({ id: 'u1', email: 'a@b.c', role: 'CUSTOMER', needsOnboarding: true })
  )
  assert.equal(Boolean(result?.needsOnboarding), true)
})

test('jwt: needsOnboarding defaults to false when user object omits it', async () => {
  const result = await callbacks.jwt!(
    jwtParams({ id: 'u1', email: 'a@b.c', role: 'CUSTOMER' })
  )
  assert.equal(Boolean(result?.needsOnboarding), false)
})

test('jwt: existing token without user is unchanged', async () => {
  const result = await callbacks.jwt!({
    token: { id: 'u1', role: 'CUSTOMER', needsOnboarding: true },
    user: undefined,
    trigger: undefined,
    isNewUser: false,
    session: undefined,
    account: null,
  } as JwtParams)
  assert.equal(Boolean(result?.needsOnboarding), true)
})

test('session: needsOnboarding mirrors token', () => {
  const result = callbacks.session!({
    session: {
      user: { id: '', email: 'a@b.c', name: 'A', role: 'CUSTOMER' },
      expires: new Date('2030-01-01').toISOString(),
    },
    token: { id: 'u1', role: 'CUSTOMER', needsOnboarding: true },
  } as SessionParams)
  const sess = result as Awaited<ReturnType<NonNullable<typeof callbacks.session>>>
  // session.user is augmented; extract via cast.
  const user = (sess as { user: { needsOnboarding?: boolean } }).user
  assert.equal(user.needsOnboarding, true)
})

test('session: needsOnboarding defaults to false when token omits it', () => {
  const result = callbacks.session!({
    session: {
      user: { id: '', email: 'a@b.c', name: 'A', role: 'CUSTOMER' },
      expires: new Date('2030-01-01').toISOString(),
    },
    token: { id: 'u1', role: 'CUSTOMER' },
  } as SessionParams)
  const user = (result as { user: { needsOnboarding?: boolean } }).user
  assert.equal(user.needsOnboarding, false)
})
