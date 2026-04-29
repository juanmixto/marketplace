import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { resetIntegrationDatabase, createUser } from './helpers'

/**
 * DB audit P1.4 (#965). OrderEvent.schemaVersion lets historical
 * reports parse old payloads with the matching reader after a
 * payload-shape change. New rows default to 1 unless the writer
 * explicitly bumps the value.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

test('OrderEvent.schemaVersion defaults to 1 when not provided', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-OE-${Date.now()}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: '10.00',
      taxAmount: '0',
      grandTotal: '10.00',
    },
  })

  const event = await db.orderEvent.create({
    data: {
      orderId: order.id,
      type: 'PAYMENT_CONFIRMED',
      payload: { amount: 1000 },
    },
  })

  assert.equal(event.schemaVersion, 1)
})

test('OrderEvent.schemaVersion is preserved when the writer bumps it', async () => {
  const customer = await createUser('CUSTOMER')
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-OE2-${Date.now()}`,
      customerId: customer.id,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: '10.00',
      taxAmount: '0',
      grandTotal: '10.00',
    },
  })

  const event = await db.orderEvent.create({
    data: {
      orderId: order.id,
      type: 'PAYMENT_CONFIRMED',
      schemaVersion: 2,
      payload: { amount: 1000, currency: 'EUR', _v: 2 },
    },
  })

  assert.equal(event.schemaVersion, 2)

  // Re-read to make sure the value round-trips through Postgres.
  const fresh = await db.orderEvent.findUnique({ where: { id: event.id } })
  assert.equal(fresh?.schemaVersion, 2)
})
