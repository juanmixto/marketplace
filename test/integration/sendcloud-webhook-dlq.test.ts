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
 * End-to-end DLQ coverage for the Sendcloud webhook (#568). Exercises
 * every failure branch and asserts:
 *   - a durable `WebhookDeadLetter` row is written
 *   - the HTTP status matches the reliability contract (non-200 only
 *     when we *want* Sendcloud to retry)
 *   - the signature guard still runs before any DB write
 */

const SECRET = 'test-webhook-secret'

function sign(body: string) {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

function webhookRequest(body: unknown, { signature }: { signature?: string | null } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const sig = signature === undefined ? sign(raw) : signature
  if (sig !== null) headers['sendcloud-signature'] = sig
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
      orderNumber: `SC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

test('invalid_signature → 401 and does NOT record a DLQ row', async () => {
  const res = await SENDCLOUD_WEBHOOK(webhookRequest({ parcel: { id: 1, status: { id: 11, message: 'ok' } } }, { signature: 'deadbeef' }))
  assert.equal(res.status, 401)
  const rows = await db.webhookDeadLetter.count({ where: { provider: 'sendcloud' } })
  assert.equal(rows, 0, 'unsigned payloads must not consume DLQ capacity')
})

test('invalid_json → 400 and records a DLQ row with payloadHash only', async () => {
  const res = await SENDCLOUD_WEBHOOK(webhookRequest('{"this is": not json', {}))
  assert.equal(res.status, 400)
  const rows = await db.webhookDeadLetter.findMany({ where: { provider: 'sendcloud' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.reason, 'invalid_json')
  // Payload snapshot is a hash of the body, not the raw body.
  const payload = rows[0]?.payload as { payloadHash?: string } | null
  assert.ok(payload?.payloadHash, 'payloadHash present on invalid_json DLQ rows')
})

test('unknown_parcel → 200 + DLQ row so operator can replay once shipment is registered', async () => {
  // Send a valid payload but for a shipment we don't have.
  const res = await SENDCLOUD_WEBHOOK(
    webhookRequest({
      action: 'parcel_status_changed',
      parcel: { id: 999, status: { id: 1500, message: 'in transit' } },
    }),
  )
  assert.equal(res.status, 200)
  const rows = await db.webhookDeadLetter.findMany({ where: { provider: 'sendcloud' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.reason, 'unknown_parcel')
  assert.equal(rows[0]?.providerRef, '999')
})

test('unknown_status → 200 + DLQ row and the shipment is NOT mutated', async () => {
  const { shipment } = await seedShipmentForVendor()
  // Status id that is not in the mapper on purpose.
  const res = await SENDCLOUD_WEBHOOK(
    webhookRequest({
      action: 'parcel_status_changed',
      parcel: { id: Number(shipment.providerRef), status: { id: 424242, message: 'mystery' } },
    }),
  )
  assert.equal(res.status, 200)

  const rows = await db.webhookDeadLetter.findMany({ where: { provider: 'sendcloud' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.reason, 'unknown_status')

  // The shipment MUST NOT have been advanced by the unknown-status
  // catch-all; that was the silent mask behaviour #568 removes.
  const fresh = await db.shipment.findUnique({ where: { id: shipment.id } })
  assert.equal(fresh?.status, 'LABEL_CREATED', 'shipment stays put until operator acts')
})

test('successful payload → 200, no DLQ row, shipment transitions', async () => {
  const { shipment } = await seedShipmentForVendor()
  const res = await SENDCLOUD_WEBHOOK(
    webhookRequest({
      action: 'parcel_status_changed',
      parcel: { id: Number(shipment.providerRef), status: { id: 1500, message: 'in transit' } },
    }),
  )
  assert.equal(res.status, 200)
  const rows = await db.webhookDeadLetter.count({ where: { provider: 'sendcloud' } })
  assert.equal(rows, 0, 'happy path must not pollute the DLQ')

  const fresh = await db.shipment.findUnique({ where: { id: shipment.id } })
  assert.equal(fresh?.status, 'IN_TRANSIT')
})
