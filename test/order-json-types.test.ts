import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOrderLineSnapshot } from '@/domains/orders/order-line-snapshot'
import {
  createPaymentConfirmedEventPayload,
  createPaymentFailedEventPayload,
  createPaymentMismatchEventPayload,
} from '@/domains/orders/order-event-payload'

test('parseOrderLineSnapshot returns typed snapshot for valid payloads', () => {
  const snapshot = parseOrderLineSnapshot({
    id: 'prod_123',
    name: 'Tomate rosa',
    slug: 'tomate-rosa',
    images: ['https://cdn.example.com/tomate.jpg'],
    unit: 'kg',
    vendorName: 'Huerta Norte',
    variantName: 'Caja 2kg',
  })

  assert.deepEqual(snapshot, {
    id: 'prod_123',
    name: 'Tomate rosa',
    slug: 'tomate-rosa',
    images: ['https://cdn.example.com/tomate.jpg'],
    unit: 'kg',
    vendorName: 'Huerta Norte',
    variantName: 'Caja 2kg',
  })
})

test('parseOrderLineSnapshot returns null for malformed snapshots', () => {
  const snapshot = parseOrderLineSnapshot({
    id: 'prod_123',
    name: 'Tomate rosa',
    unit: 'kg',
  })

  assert.equal(snapshot, null)
})

test('createPaymentConfirmedEventPayload validates known webhook payloads', () => {
  const payload = createPaymentConfirmedEventPayload({
    providerRef: 'pi_123',
    amount: 2199,
    eventId: 'evt_123',
  })

  assert.deepEqual(payload, {
    providerRef: 'pi_123',
    amount: 2199,
    eventId: 'evt_123',
  })
})

test('createPaymentFailedEventPayload validates failure payloads', () => {
  const payload = createPaymentFailedEventPayload({
    providerRef: 'pi_123',
    eventId: 'evt_456',
  })

  assert.deepEqual(payload, {
    providerRef: 'pi_123',
    eventId: 'evt_456',
  })
})

test('createPaymentMismatchEventPayload keeps expected and received payment metadata', () => {
  const payload = createPaymentMismatchEventPayload({
    providerRef: 'pi_123',
    amount: 2100,
    currency: 'eur',
    eventId: 'evt_789',
    expectedAmount: 21,
    expectedCurrency: 'EUR',
  })

  assert.equal(payload.expectedAmount, 21)
  assert.equal(payload.expectedCurrency, 'EUR')
  assert.equal(payload.amount, 2100)
})
