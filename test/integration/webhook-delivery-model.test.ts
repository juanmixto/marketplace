import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { resetIntegrationDatabase } from './helpers'

/**
 * Issue #407: WebhookDelivery model.
 *
 * This PR only ADDS the model + migration — the route handler swap to
 * use it for dedupe is sub-issue #408 in a separate PR. The tests here
 * just pin the schema contract:
 *
 * 1. The unique constraint on (provider, eventId) actually fires.
 * 2. The default values land as expected.
 * 3. Independent eventIds across providers do not collide.
 *
 * Once #408 swaps the route, additional tests will exercise the
 * insert-then-update lifecycle.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('WebhookDelivery enforces UNIQUE (provider, eventId) — duplicate insert fails with P2002', async () => {
  await db.webhookDelivery.create({
    data: {
      provider: 'stripe',
      eventId: 'evt_dedupe_1',
      eventType: 'payment_intent.succeeded',
    },
  })

  await assert.rejects(
    () =>
      db.webhookDelivery.create({
        data: {
          provider: 'stripe',
          eventId: 'evt_dedupe_1',
          eventType: 'payment_intent.succeeded',
        },
      }),
    (err: unknown) => {
      // Prisma surfaces this as P2002 (unique constraint violation).
      const message = err instanceof Error ? err.message : String(err)
      return /P2002|Unique constraint/i.test(message)
    },
  )
})

test('WebhookDelivery sets defaults: status=received, receivedAt now, processedAt null', async () => {
  const row = await db.webhookDelivery.create({
    data: {
      provider: 'stripe',
      eventId: 'evt_defaults_1',
      eventType: 'invoice.paid',
    },
  })
  assert.equal(row.status, 'received')
  assert.equal(row.processedAt, null)
  assert.ok(row.receivedAt instanceof Date)
  // received within the last 60s — generous to keep this test stable
  // on slow CI.
  assert.ok(Date.now() - row.receivedAt.getTime() < 60_000)
})

test('the same eventId on a different provider does NOT collide', async () => {
  await db.webhookDelivery.create({
    data: {
      provider: 'stripe',
      eventId: 'evt_shared_id',
      eventType: 'payment_intent.succeeded',
    },
  })
  // sendcloud might one day reuse the same id space; the unique is
  // intentionally scoped per provider so this must succeed.
  const sendcloud = await db.webhookDelivery.create({
    data: {
      provider: 'sendcloud',
      eventId: 'evt_shared_id',
      eventType: 'parcel_status_changed',
    },
  })
  assert.equal(sendcloud.provider, 'sendcloud')
})
