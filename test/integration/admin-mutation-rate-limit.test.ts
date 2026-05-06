import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import {
  enforceAdminMutationRateLimit,
  AdminMutationRateLimitError,
} from '@/domains/admin/rate-limit'
import { approveVendor } from '@/domains/admin/actions'
import {
  buildSession,
  clearTestSession,
  createUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #1352 (epic #1346 — PII pre-launch).
 *
 * Sensitive admin mutations were unbounded. A compromised admin cookie
 * could approve 1000 fake vendors in a minute or refund the entire
 * float in a tight loop. This suite exercises the new
 * `enforceAdminMutationRateLimit` guard at both layers:
 *   - the helper itself (deterministic per-actor bucket),
 *   - one real action wired through it (`approveVendor`).
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('enforceAdminMutationRateLimit throws on the (limit+1)th call within the window', async () => {
  const actor = await createUser('ADMIN_OPS')

  for (let i = 0; i < 5; i++) {
    await enforceAdminMutationRateLimit({
      scope: 'integration-test-1',
      actorId: actor.id,
      limit: 5,
      windowSeconds: 60,
    })
  }

  await assert.rejects(
    () =>
      enforceAdminMutationRateLimit({
        scope: 'integration-test-1',
        actorId: actor.id,
        limit: 5,
        windowSeconds: 60,
      }),
    (err: unknown) => err instanceof AdminMutationRateLimitError,
  )
})

test('rate-limit buckets are scoped per-actor — actor B is unaffected by actor A exhausting theirs', async () => {
  const actorA = await createUser('ADMIN_OPS')
  const actorB = await createUser('ADMIN_OPS')

  for (let i = 0; i < 3; i++) {
    await enforceAdminMutationRateLimit({
      scope: 'integration-test-2',
      actorId: actorA.id,
      limit: 3,
      windowSeconds: 60,
    })
  }
  await assert.rejects(() =>
    enforceAdminMutationRateLimit({
      scope: 'integration-test-2',
      actorId: actorA.id,
      limit: 3,
      windowSeconds: 60,
    }),
  )

  // Actor B in the same scope, same window, must still be allowed.
  await enforceAdminMutationRateLimit({
    scope: 'integration-test-2',
    actorId: actorB.id,
    limit: 3,
    windowSeconds: 60,
  })
})

test('approveVendor throws AdminMutationRateLimitError after exhausting the vendor-moderation bucket', async () => {
  const admin = await createUser('ADMIN_OPS')
  useTestSession(buildSession(admin.id, 'ADMIN_OPS'))

  // Pre-seed the bucket up to the cap with the same scope key the
  // production code uses. Avoids creating 30 vendors just to hit
  // the limit.
  for (let i = 0; i < 30; i++) {
    await enforceAdminMutationRateLimit({
      scope: 'vendor-moderation',
      actorId: admin.id,
      limit: 30,
      windowSeconds: 60,
    })
  }

  // Build one real vendor + user so approveVendor's pre-checks
  // succeed up to the rate-limit gate.
  const vendorUser = await createUser('CUSTOMER')
  const vendor = await db.vendor.create({
    data: {
      userId: vendorUser.id,
      slug: `v-rate-${Date.now()}`,
      displayName: 'Rate Test',
      status: 'APPLYING',
    },
  })

  await assert.rejects(
    () => approveVendor(vendor.id),
    (err: unknown) => err instanceof AdminMutationRateLimitError,
  )

  // Vendor must still be APPLYING — the rate-limit fired before the
  // status mutation could land.
  const after = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(after.status, 'APPLYING')
})
