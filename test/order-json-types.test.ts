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
test('parseOrderLineSnapshot returns snapshot with optional variantName as null', () => {
  const snapshot = parseOrderLineSnapshot({
    id: 'prod_456',
    name: 'Aceite de oliva',
    slug: 'aceite-oliva',
    images: [],
    unit: 'botella',
    vendorName: 'Almazara Sur',
    variantName: null,
  })

  assert.ok(snapshot)
  assert.equal(snapshot.variantName, null)
})

test('parseOrderLineSnapshot rejects payloads with extra forbidden fields gracefully', () => {
  // Zod strips unknown fields — snapshot remains valid
  const snapshot = parseOrderLineSnapshot({
    id: 'prod_789',
    name: 'Miel',
    slug: 'miel-campo',
    images: ['https://cdn.example.com/miel.jpg'],
    unit: 'tarro',
    vendorName: 'Apicultura Montaña',
    variantName: null,
    unknownField: 'should be stripped',
  })

  assert.ok(snapshot)
  assert.equal('unknownField' in (snapshot as object), false)
})
