import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { resetIntegrationDatabase } from './helpers'

/**
 * #1335: Sendcloud WebhookDelivery dedupe — same eventId twice ⇒ one
 * processed delivery row. The previous defence (isValidTransition
 * rejecting self-loops) only protected the shipment status update; a
 * duplicate webhook still wrote a duplicate ShipmentEvent.
 *
 * We test the persistence-level guarantee rather than the HTTP path
 * (which would need a Next.js test server). The route's logic is a thin
 * wrapper around `db.webhookDelivery.create({ data: { provider, eventId, ...} })`
 * with UNIQUE(provider, eventId). The unique constraint is the contract.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(async () => {})

test('webhookDelivery: duplicate (provider, eventId) rejected by UNIQUE', async () => {
  const eventId = `sendcloud_test_${randomUUID().slice(0, 8)}`

  const first = await db.webhookDelivery.create({
    data: {
      provider: 'sendcloud',
      eventId,
      eventType: 'sendcloud.parcel_status_changed',
      payloadHash: 'hash_a',
    },
  })
  assert.ok(first.id)

  await assert.rejects(
    () =>
      db.webhookDelivery.create({
        data: {
          provider: 'sendcloud',
          eventId,
          eventType: 'sendcloud.parcel_status_changed',
          payloadHash: 'hash_b',
        },
      }),
    /Unique constraint|P2002/i,
  )

  const rows = await db.webhookDelivery.findMany({
    where: { provider: 'sendcloud', eventId },
  })
  assert.equal(rows.length, 1, 'only one delivery row should exist for the same eventId')
})

test('webhookDelivery: same eventId across providers is allowed', async () => {
  const eventId = `evt_shared_${randomUUID().slice(0, 8)}`
  await db.webhookDelivery.create({
    data: {
      provider: 'stripe',
      eventId,
      eventType: 'payment_intent.succeeded',
      payloadHash: 'h1',
    },
  })
  await db.webhookDelivery.create({
    data: {
      provider: 'sendcloud',
      eventId,
      eventType: 'sendcloud.parcel_status_changed',
      payloadHash: 'h2',
    },
  })
  const rows = await db.webhookDelivery.findMany({ where: { eventId } })
  assert.equal(rows.length, 2)
})
