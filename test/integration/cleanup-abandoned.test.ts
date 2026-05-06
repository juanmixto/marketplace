import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { runCleanupAbandonedJob } from '@/workers/jobs/cleanup-abandoned'
import { createUser, resetIntegrationDatabase } from './helpers'

/**
 * Issue #1285 (epic #1268 Bloque 2).
 *
 * Nightly cleanup-abandoned job purges expired ephemeral state from
 * the four token tables. Each delete is `expiresAt < now` — past
 * tokens go, future tokens stay.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000)
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000)

async function seedTokens(userId: string) {
  const tokenSuffix = (kind: string, future: boolean) =>
    `${kind}-${future ? 'future' : 'past'}-${userId}-${Math.random().toString(36).slice(2, 8)}`

  await db.emailVerificationToken.createMany({
    data: [
      { userId, tokenHash: tokenSuffix('email', false), expiresAt: PAST },
      { userId, tokenHash: tokenSuffix('email', true), expiresAt: FUTURE },
    ],
  })
  await db.passwordResetToken.createMany({
    data: [
      { userId, tokenHash: tokenSuffix('reset', false), expiresAt: PAST },
      { userId, tokenHash: tokenSuffix('reset', true), expiresAt: FUTURE },
    ],
  })
  await db.telegramLinkToken.createMany({
    data: [
      { userId, token: tokenSuffix('tg', false), expiresAt: PAST },
      { userId, token: tokenSuffix('tg', true), expiresAt: FUTURE },
    ],
  })
  await db.verificationToken.createMany({
    data: [
      { identifier: `mail-${userId}-past`, token: tokenSuffix('vt', false), expires: PAST },
      { identifier: `mail-${userId}-future`, token: tokenSuffix('vt', true), expires: FUTURE },
    ],
  })
}

test('runCleanupAbandonedJob deletes only expired tokens across all four tables', async () => {
  const user = await createUser('CUSTOMER')
  await seedTokens(user.id)

  const result = await runCleanupAbandonedJob()
  assert.equal(result.emailVerificationTokens, 1)
  assert.equal(result.passwordResetTokens, 1)
  assert.equal(result.telegramLinkTokens, 1)
  assert.equal(result.verificationTokens, 1)

  // Future tokens survive.
  assert.equal(await db.emailVerificationToken.count({ where: { userId: user.id } }), 1)
  assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 1)
  assert.equal(await db.telegramLinkToken.count({ where: { userId: user.id } }), 1)
  assert.equal(await db.verificationToken.count(), 1)
})

test('runCleanupAbandonedJob is idempotent — second run yields zero deletes', async () => {
  const user = await createUser('CUSTOMER')
  await seedTokens(user.id)

  await runCleanupAbandonedJob()
  const second = await runCleanupAbandonedJob()
  assert.equal(second.emailVerificationTokens, 0)
  assert.equal(second.passwordResetTokens, 0)
  assert.equal(second.telegramLinkTokens, 0)
  assert.equal(second.verificationTokens, 0)
})

test('runCleanupAbandonedJob with no expired tokens is a no-op', async () => {
  const user = await createUser('CUSTOMER')
  await db.emailVerificationToken.create({
    data: { userId: user.id, tokenHash: 'fresh', expiresAt: FUTURE },
  })

  const result = await runCleanupAbandonedJob()
  assert.equal(result.emailVerificationTokens, 0)
  assert.equal(await db.emailVerificationToken.count({ where: { userId: user.id } }), 1)
})

test('runCleanupAbandonedJob respects an injected clock (tests the now() boundary)', async () => {
  const user = await createUser('CUSTOMER')
  // Token expires in 1h.
  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: 'soon',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  // "Now" 2h in the future → token is expired.
  const result = await runCleanupAbandonedJob({
    now: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
  })
  assert.equal(result.emailVerificationTokens, 1)
  assert.equal(await db.emailVerificationToken.count({ where: { userId: user.id } }), 0)
})
