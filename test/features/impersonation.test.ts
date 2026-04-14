import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IMPERSONATION_ENABLED_ENV_VAR,
  assertNotReadOnlyImpersonation,
  createImpersonationSessionId,
  isImpersonationEnabled,
  signImpersonationToken,
  verifyImpersonationToken,
  type ImpersonationContext,
} from '@/lib/impersonation'

// These tests configure AUTH_SECRET at module load time via the test
// runner env. If another test clears it, restore between tests.
const originalSecret = process.env.AUTH_SECRET
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-for-impersonation'

test('signImpersonationToken produces a verifiable token and decodes to the same payload', () => {
  const token = signImpersonationToken({
    sid: 'sid_abc',
    adminId: 'user_admin',
    targetUserId: 'user_vendor_owner',
    vendorId: 'vendor_1',
    readOnly: true,
  })

  const context = verifyImpersonationToken(token)
  assert.ok(context, 'token should verify successfully')
  assert.equal(context?.sid, 'sid_abc')
  assert.equal(context?.adminId, 'user_admin')
  assert.equal(context?.vendorId, 'vendor_1')
  assert.equal(context?.readOnly, true)
  assert.ok((context?.remainingSeconds ?? 0) > 0)
})

test('verifyImpersonationToken rejects tokens with a tampered signature', () => {
  const token = signImpersonationToken({
    sid: 'sid_xyz',
    adminId: 'user_admin',
    targetUserId: 'user_owner',
    vendorId: 'vendor_42',
    readOnly: false,
  })

  const dot = token.indexOf('.')
  const body = token.slice(0, dot)
  // Flip one byte of the signature.
  const tampered = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

  assert.equal(verifyImpersonationToken(tampered), null)
})

test('verifyImpersonationToken rejects tokens with a tampered body', () => {
  const token = signImpersonationToken({
    sid: 'sid_t1',
    adminId: 'user_admin',
    targetUserId: 'user_owner',
    vendorId: 'vendor_42',
    readOnly: true,
  })

  const dot = token.indexOf('.')
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  // Try to re-encode a new payload with the old signature.
  const newBody = Buffer.from(JSON.stringify({
    sid: 'sid_t1',
    adminId: 'user_admin',
    targetUserId: 'user_owner',
    vendorId: 'vendor_42',
    readOnly: false, // ← attacker attempt to escalate to write mode
    exp: Math.floor(Date.now() / 1000) + 900,
  }), 'utf8').toString('base64url')

  assert.notEqual(newBody, body)
  assert.equal(verifyImpersonationToken(`${newBody}.${sig}`), null)
})

test('verifyImpersonationToken rejects expired tokens', () => {
  // TTL of 0 seconds means `exp` == now. The check is strict (exp <= now → reject).
  const token = signImpersonationToken(
    {
      sid: 'sid_exp',
      adminId: 'user_admin',
      targetUserId: 'user_owner',
      vendorId: 'vendor_42',
      readOnly: true,
    },
    0
  )
  assert.equal(verifyImpersonationToken(token), null)
})

test('verifyImpersonationToken rejects malformed inputs', () => {
  assert.equal(verifyImpersonationToken(null), null)
  assert.equal(verifyImpersonationToken(undefined), null)
  assert.equal(verifyImpersonationToken(''), null)
  assert.equal(verifyImpersonationToken('no-dot-here'), null)
  assert.equal(verifyImpersonationToken('.just-dot'), null)
  assert.equal(verifyImpersonationToken('x.y'), null)
})

test('createImpersonationSessionId returns unique base64url strings', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 50; i++) {
    const id = createImpersonationSessionId()
    assert.match(id, /^[A-Za-z0-9_-]+$/)
    assert.ok(!seen.has(id), `sid collision: ${id}`)
    seen.add(id)
  }
})

test('assertNotReadOnlyImpersonation throws only when readOnly is true', () => {
  assert.doesNotThrow(() => assertNotReadOnlyImpersonation(null))
  assert.doesNotThrow(() =>
    assertNotReadOnlyImpersonation({
      sid: 's', adminId: 'a', targetUserId: 'u', vendorId: 'v',
      readOnly: false, exp: 0, remainingSeconds: 100,
    } satisfies ImpersonationContext)
  )
  assert.throws(
    () =>
      assertNotReadOnlyImpersonation({
        sid: 's', adminId: 'a', targetUserId: 'u', vendorId: 'v',
        readOnly: true, exp: 0, remainingSeconds: 100,
      } satisfies ImpersonationContext),
    /read-only/
  )
})

test('isImpersonationEnabled reflects the IMPERSONATION_ENABLED env var', () => {
  const previous = process.env[IMPERSONATION_ENABLED_ENV_VAR]
  try {
    process.env[IMPERSONATION_ENABLED_ENV_VAR] = 'true'
    assert.equal(isImpersonationEnabled(), true)

    process.env[IMPERSONATION_ENABLED_ENV_VAR] = 'false'
    assert.equal(isImpersonationEnabled(), false)

    delete process.env[IMPERSONATION_ENABLED_ENV_VAR]
    assert.equal(isImpersonationEnabled(), false)
  } finally {
    if (previous === undefined) delete process.env[IMPERSONATION_ENABLED_ENV_VAR]
    else process.env[IMPERSONATION_ENABLED_ENV_VAR] = previous
  }
})

test.after(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = originalSecret
})
