import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AuthLinkTokenError,
  AUTH_LINK_TOKEN_TTL_SECONDS,
  signAuthLinkToken,
  verifyAuthLinkToken,
} from '@/lib/auth-link-token'

const SECRET = 'test-secret-please-do-not-use-in-prod'

test('signAuthLinkToken roundtrip preserves payload', async () => {
  const now = 1_700_000_000
  const token = await signAuthLinkToken(
    {
      email: 'juan@x.com',
      provider: 'google',
      providerAccountId: 'sub_123',
      callbackUrl: '/checkout',
    },
    SECRET,
    now
  )
  const payload = await verifyAuthLinkToken(token, SECRET, now + 10)
  assert.equal(payload.email, 'juan@x.com')
  assert.equal(payload.provider, 'google')
  assert.equal(payload.providerAccountId, 'sub_123')
  assert.equal(payload.callbackUrl, '/checkout')
  assert.equal(payload.exp, now + AUTH_LINK_TOKEN_TTL_SECONDS)
})

test('verifyAuthLinkToken rejects expired tokens', async () => {
  const now = 1_700_000_000
  const token = await signAuthLinkToken(
    { email: 'a@b.c', provider: 'google', providerAccountId: 's' },
    SECRET,
    now
  )
  await assert.rejects(
    () => verifyAuthLinkToken(token, SECRET, now + AUTH_LINK_TOKEN_TTL_SECONDS + 1),
    (err: unknown) => err instanceof AuthLinkTokenError && err.code === 'expired'
  )
})

test('verifyAuthLinkToken rejects tokens signed with a different secret', async () => {
  const token = await signAuthLinkToken(
    { email: 'a@b.c', provider: 'google', providerAccountId: 's' },
    SECRET
  )
  await assert.rejects(
    () => verifyAuthLinkToken(token, 'other-secret'),
    (err: unknown) => err instanceof AuthLinkTokenError && err.code === 'bad_signature'
  )
})

test('verifyAuthLinkToken rejects tampered payload', async () => {
  const token = await signAuthLinkToken(
    { email: 'a@b.c', provider: 'google', providerAccountId: 's' },
    SECRET
  )
  // Flip a single character in the body part of the token.
  const [body, sig] = token.split('.') as [string, string]
  const tampered = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}.${sig}`
  await assert.rejects(
    () => verifyAuthLinkToken(tampered, SECRET),
    (err: unknown) =>
      err instanceof AuthLinkTokenError &&
      (err.code === 'bad_signature' || err.code === 'malformed')
  )
})

test('verifyAuthLinkToken rejects malformed input', async () => {
  await assert.rejects(
    () => verifyAuthLinkToken('not-a-token', SECRET),
    (err: unknown) => err instanceof AuthLinkTokenError && err.code === 'malformed'
  )
})
