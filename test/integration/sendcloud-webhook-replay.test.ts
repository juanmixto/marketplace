import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { POST as SENDCLOUD_WEBHOOK } from '@/app/api/webhooks/sendcloud/route'
import { db } from '@/lib/db'
import { resetServerEnvCache } from '@/lib/env'
import {
  createUser,
  createVendorUser,
  resetIntegrationDatabase,
} from './helpers'

/**
 * #1335 — WebhookDelivery dedupe for Sendcloud.
 *
 * Stripe webhooks already dedupe via `WebhookDelivery` UNIQUE
 * (provider, eventId). Sendcloud relied on `isValidTransition`
 * rejecting self-loops, which works for `Shipment.status` but lets
 * spurious `ShipmentEvent` rows through when the same event is
 * delivered twice with the same rank but a different payload.
 *
 * This test exercises the new dedupe path:
 *
 *   1. First delivery → 1 WebhookDelivery row, 1 transition,
 *      `appendShipmentEvent` rows present.
 *   2. Replay (identical body) → no second WebhookDelivery row, no
 *      DLQ row, no extra ShipmentEvent for the same id.
 *   3. Different body for the same parcel → distinct eventId →
 *      processes again (the dedupe is per-payload, not per-shipment).
 */

const SECRET = 'test-webhook-secret'

function sign(body: string) {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

function webhookRequest(body: unknown) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'sendcloud-signature': sign(raw),
  }
  return new Request('http://localhost/api/webhooks/sendcloud', {
    method: 'POST',
    headers,
    body: raw,
  }) as unknown as Parameters<typeof SENDCLOUD_WEBHOOK>[0]
}

beforeEach(async () => {
  await resetIntegrationDatabase()
  Object.assign(process.env, {
    NODE_ENV: 'test',
    SENDCLOUD_WEBHOOK_SECRET: SECRET,
    SENDCLOUD_PUBLIC_KEY: 'test-public',
    SENDCLOUD_SECRET_KEY: 'test-secret',
  })
  resetServerEnvCache()
})

afterEach(() => {})

async function seedShipmentForVendor() {
  const { vendor } = await createVendorUser()
  const buyer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `SC-DEDUPE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customerId: buyer.id,
      status: 'PROCESSING',
      paymentStatus: 'SUCCEEDED',
      subtotal: 10,
      shippingCost: 0,
      taxAmount: 0,
      grandTotal: 10,
    },
  })
  const fulfillment = await db.vendorFulfillment.create({
    data: { orderId: order.id, vendorId: vendor.id, status: 'READY' },
  })
  const shipment = await db.shipment.create({
    data: {
      fulfillmentId: fulfillment.id,
      providerCode: 'SENDCLOUD',
      providerRef: '42',
      status: 'LABEL_CREATED',
      fromAddressSnapshot: { name: 'Vendor', line1: 'Origen 1', city: 'Madrid', postalCode: '28001', countryCode: 'ES' },
      toAddressSnapshot: { name: 'Buyer', line1: 'Destino 1', city: 'Madrid', postalCode: '28001', countryCode: 'ES' },
      weightGrams: 1000,
      idempotencyKey: `test-${Math.random().toString(36).slice(2, 10)}`,
    },
  })
  return { vendor, buyer, order, fulfillment, shipment }
}

const transitPayload = {
  action: 'parcel_status_changed',
  timestamp: 1_700_000_000,
  parcel: { id: 42, status: { id: 1500, message: 'in transit' } },
}

test('first delivery → 1 WebhookDelivery row + 1 transition', async () => {
  await seedShipmentForVendor()

  const res = await SENDCLOUD_WEBHOOK(webhookRequest(transitPayload))
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.ok, true)

  const deliveries = await db.webhookDelivery.findMany({
    where: { provider: 'sendcloud' },
  })
  assert.equal(deliveries.length, 1, 'exactly one delivery row after first call')

  const refreshed = await db.shipment.findFirst({
    where: { providerCode: 'SENDCLOUD', providerRef: '42' },
  })
  assert.equal(refreshed?.status, 'IN_TRANSIT')
})

test('replay of identical body → no extra delivery row, no DLQ row, no transition', async () => {
  const { shipment } = await seedShipmentForVendor()

  await SENDCLOUD_WEBHOOK(webhookRequest(transitPayload))
  const eventsAfterFirst = await db.shipmentEvent.count({
    where: { shipmentId: shipment.id },
  })

  // Replay
  const res = await SENDCLOUD_WEBHOOK(webhookRequest(transitPayload))
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.ok, true)
  assert.equal(json.skipped, 'duplicate', 'replay returns skipped=duplicate')

  const deliveries = await db.webhookDelivery.findMany({
    where: { provider: 'sendcloud' },
  })
  assert.equal(deliveries.length, 1, 'still exactly one delivery row after replay')

  const dlq = await db.webhookDeadLetter.count({ where: { provider: 'sendcloud' } })
  assert.equal(dlq, 0, 'idempotent replay must not consume DLQ capacity')

  const eventsAfterReplay = await db.shipmentEvent.count({
    where: { shipmentId: shipment.id },
  })
  assert.equal(
    eventsAfterReplay,
    eventsAfterFirst,
    'no new ShipmentEvent rows on replay',
  )
})

test('different body for same parcel → distinct eventId → processes again', async () => {
  const { shipment } = await seedShipmentForVendor()

  // First event: in transit.
  await SENDCLOUD_WEBHOOK(webhookRequest(transitPayload))

  // Second event: out for delivery — same parcel, different status,
  // different timestamp. The eventId is a hash of the raw body so it
  // is distinct, dedupe must not collapse them.
  const outForDelivery = {
    action: 'parcel_status_changed',
    timestamp: 1_700_000_500,
    parcel: { id: 42, status: { id: 1800, message: 'out for delivery' } },
  }
  const res = await SENDCLOUD_WEBHOOK(webhookRequest(outForDelivery))
  assert.equal(res.status, 200)

  const deliveries = await db.webhookDelivery.findMany({
    where: { provider: 'sendcloud' },
    orderBy: { receivedAt: 'asc' },
  })
  assert.equal(deliveries.length, 2, 'two distinct events → two delivery rows')

  const refreshed = await db.shipment.findUnique({ where: { id: shipment.id } })
  assert.equal(refreshed?.status, 'OUT_FOR_DELIVERY')
})
