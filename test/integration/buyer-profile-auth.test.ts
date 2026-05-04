import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { PUT as PUT_PROFILE } from '@/app/api/buyers/profile/route'
import { db } from '@/lib/db'
import {
  buildSession,
  clearTestSession,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #1143 / #1157 / #1142.
 *
 * The pre-prod authz audit found that PUT /api/buyers/profile
 * accepted email changes with no re-authentication, opening a
 * one-step ATO from a stolen session (change email → reset
 * password). It also returned 409 on email collisions, turning the
 * endpoint into an account-existence oracle.
 *
 * This file exercises the patched contract:
 *   - email change requires currentPassword (re-auth) and resets
 *     emailVerified, deletes pending verification tokens, and
 *     bumps tokenVersion.
 *   - email collision is silently swallowed; the response is
 *     indistinguishable from "no change applied".
 *   - non-email updates (firstName / lastName) skip every gate.
 *   - OAuth-only accounts (passwordHash null) are rejected — the
 *     follow-up confirm-from-old-email flow is out of scope.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/buyers/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof PUT_PROFILE>[0]
}

async function createBuyer({
  email = `buyer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
  password = 'secret-password-1',
  emailVerified = new Date(),
}: { email?: string; password?: string; emailVerified?: Date | null } = {}) {
  const passwordHash = await bcrypt.hash(password, 4)
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Buyer',
      lastName: 'Tester',
      role: 'CUSTOMER',
      isActive: true,
      emailVerified,
    },
  })
  return { user, password }
}

// ── name-only update: no gate, no token churn ────────────────────────────────

test('PUT /api/buyers/profile: name-only update succeeds without currentPassword', async () => {
  const { user } = await createBuyer()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await PUT_PROFILE(
    jsonRequest({ firstName: 'New', lastName: 'Name', email: user.email }),
  )
  assert.equal(res.status, 200)

  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.firstName, 'New')
  assert.equal(after.lastName, 'Name')
  assert.ok(after.emailVerified, 'emailVerified must NOT be reset on name-only edit')
  assert.equal(after.tokenVersion, user.tokenVersion, 'tokenVersion must NOT bump on name-only edit')
})

// ── email change without currentPassword → 400 ───────────────────────────────

test('PUT /api/buyers/profile: email change without currentPassword → 400 + no DB write (#1143)', async () => {
  const { user } = await createBuyer()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await PUT_PROFILE(
    jsonRequest({
      firstName: 'Buyer',
      lastName: 'Tester',
      email: 'attacker@evil.invalid',
    }),
  )
  assert.equal(res.status, 400)

  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.email, user.email)
  assert.ok(after.emailVerified)
  assert.equal(after.tokenVersion, user.tokenVersion)
})

// ── email change with WRONG currentPassword → 401 ────────────────────────────

test('PUT /api/buyers/profile: email change with wrong currentPassword → 401 + no DB write (#1143)', async () => {
  const { user } = await createBuyer()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await PUT_PROFILE(
    jsonRequest({
      firstName: 'Buyer',
      lastName: 'Tester',
      email: 'attacker@evil.invalid',
      currentPassword: 'this-is-not-the-password',
    }),
  )
  assert.equal(res.status, 401)

  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.email, user.email)
  assert.ok(after.emailVerified)
  assert.equal(after.tokenVersion, user.tokenVersion)
})

// ── happy path: email change resets emailVerified + bumps tokenVersion ───────

test('PUT /api/buyers/profile: valid email change resets verification + bumps tokenVersion (#1142 / #1143)', async () => {
  const { user, password } = await createBuyer()
  useTestSession(buildSession(user.id, 'CUSTOMER'))

  const res = await PUT_PROFILE(
    jsonRequest({
      firstName: 'Buyer',
      lastName: 'Tester',
      email: 'newaddress@example.com',
      currentPassword: password,
    }),
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.email, 'newaddress@example.com')
  assert.equal(body.emailChangePending, true)

  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.email, 'newaddress@example.com')
  assert.equal(after.emailVerified, null, 'emailVerified must be cleared on email change')
  assert.ok(
    after.tokenVersion > user.tokenVersion,
    `tokenVersion must increment (was ${user.tokenVersion}, now ${after.tokenVersion})`,
  )
})

// ── #1157: email collision is invisible (no enumeration) ─────────────────────

test('PUT /api/buyers/profile: email collision → 200 with neutral body, no DB write (#1157)', async () => {
  const { user, password } = await createBuyer()
  // A different user already owns the target email.
  await createBuyer({ email: 'taken@example.com' })

  useTestSession(buildSession(user.id, 'CUSTOMER'))
  const res = await PUT_PROFILE(
    jsonRequest({
      firstName: 'Buyer',
      lastName: 'Tester',
      email: 'taken@example.com',
      currentPassword: password,
    }),
  )
  // Crucially NOT 409 — the response is indistinguishable from a
  // legitimate change so the endpoint cannot be used as an oracle.
  assert.equal(res.status, 200)

  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.email, user.email, 'email must NOT have changed')
  assert.equal(after.tokenVersion, user.tokenVersion, 'tokenVersion must NOT bump')
  assert.ok(after.emailVerified, 'emailVerified must remain set')
})

// ── OAuth-only accounts cannot satisfy the password gate ─────────────────────

test('PUT /api/buyers/profile: OAuth-only account cannot change email via this surface', async () => {
  const user = await db.user.create({
    data: {
      email: `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
      passwordHash: null,
      firstName: 'OAuth',
      lastName: 'Tester',
      role: 'CUSTOMER',
      isActive: true,
      emailVerified: new Date(),
    },
  })
  useTestSession(buildSession(user.id, 'CUSTOMER'))
  const res = await PUT_PROFILE(
    jsonRequest({
      firstName: 'OAuth',
      lastName: 'Tester',
      email: 'newaddress@example.com',
      currentPassword: 'irrelevant',
    }),
  )
  assert.equal(res.status, 409)
  const after = await db.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(after.email, user.email)
})
