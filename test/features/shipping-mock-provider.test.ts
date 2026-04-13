import test from 'node:test'
import assert from 'node:assert/strict'
import { MockShippingProvider } from '@/domains/shipping/providers/mock'
import type { ShipmentDraft } from '@/domains/shipping/domain/types'

function draft(overrides: Partial<ShipmentDraft> = {}): ShipmentDraft {
  return {
    idempotencyKey: 'fulfillment:test:v1',
    reference: 'ORD-1',
    from: {
      contactName: 'Vendor',
      phone: '+34 600 000 000',
      line1: 'L1',
      city: 'City',
      province: 'Prov',
      postalCode: '28000',
      countryCode: 'ES',
    },
    to: {
      contactName: 'Buyer',
      phone: '+34 611 111 111',
      line1: 'L1',
      city: 'City',
      province: 'Prov',
      postalCode: '28001',
      countryCode: 'ES',
    },
    weightGrams: 1000,
    parcelCount: 1,
    items: [],
    ...overrides,
  }
}

test('MockShippingProvider.createShipment produces a LABEL_CREATED record with tracking', async () => {
  const provider = new MockShippingProvider()
  const record = await provider.createShipment(draft())
  assert.equal(record.providerCode, 'SENDCLOUD')
  assert.equal(record.status, 'LABEL_CREATED')
  assert.ok(record.providerRef)
  assert.ok(record.trackingNumber)
  assert.ok(record.labelUrl)
})

test('MockShippingProvider.getShipment returns what was created', async () => {
  const provider = new MockShippingProvider()
  const created = await provider.createShipment(draft())
  const fetched = await provider.getShipment(created.providerRef)
  assert.deepEqual(fetched, created)
})

test('MockShippingProvider.cancelShipment moves the record to CANCELLED', async () => {
  const provider = new MockShippingProvider()
  const created = await provider.createShipment(draft())
  const result = await provider.cancelShipment(created.providerRef)
  assert.equal(result.cancelled, true)
  const fetched = await provider.getShipment(created.providerRef)
  assert.equal(fetched.status, 'CANCELLED')
})

test('MockShippingProvider with failCreate throws a typed ShippingError', async () => {
  const provider = new MockShippingProvider({ failCreate: true })
  await assert.rejects(provider.createShipment(draft()), /failed/)
})

test('MockShippingProvider.getShipment throws ShippingNotFoundError for unknown refs', async () => {
  const provider = new MockShippingProvider()
  await assert.rejects(provider.getShipment('does-not-exist'), /not found/i)
})
