import test from 'node:test'
import assert from 'node:assert/strict'
import {
  draftToSendcloud,
  mapSendcloudStatus,
  sendcloudToRecord,
  sendcloudToTracking,
} from '@/domains/shipping/providers/sendcloud/mapper'
import type { ShipmentDraft } from '@/domains/shipping/domain/types'
import type { SendcloudParcelResponse } from '@/domains/shipping/providers/sendcloud/client'

function makeDraft(): ShipmentDraft {
  return {
    idempotencyKey: 'fulfillment:abc:v1',
    reference: 'ORD-001',
    from: {
      contactName: 'Finca El Olivar',
      phone: '+34 600 000 000',
      line1: 'Calle Origen 1',
      city: 'Jaén',
      province: 'Jaén',
      postalCode: '23001',
      countryCode: 'ES',
    },
    to: {
      contactName: 'Ana Comprador',
      phone: '+34 611 111 111',
      line1: 'Calle Destino 2',
      line2: '3ºB',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
      countryCode: 'ES',
    },
    weightGrams: 2500,
    parcelCount: 1,
    items: [
      {
        description: 'Aceite 500ml',
        quantity: 2,
        weightGrams: 600,
        unitPriceCents: 1299,
        sku: 'prod_1',
      },
    ],
  }
}

test('draftToSendcloud maps weights to kilograms with 3 decimals', () => {
  const body = draftToSendcloud(makeDraft(), 42)
  assert.equal(body.parcel.weight, '2.500')
  assert.equal(body.parcel.parcel_items[0]!.weight, '0.600')
  assert.equal(body.parcel.parcel_items[0]!.value, '12.99')
  assert.equal(body.parcel.sender_address, 42)
  assert.equal(body.parcel.request_label, true)
  assert.equal(body.parcel.order_number, 'ORD-001')
})

test('draftToSendcloud omits sender_address when null', () => {
  const body = draftToSendcloud(makeDraft(), null)
  assert.equal(body.parcel.sender_address, undefined)
})

test('mapSendcloudStatus: known codes map to internal statuses', () => {
  assert.equal(mapSendcloudStatus(1000), 'LABEL_CREATED')
  assert.equal(mapSendcloudStatus(1500), 'IN_TRANSIT')
  assert.equal(mapSendcloudStatus(1800), 'OUT_FOR_DELIVERY')
  assert.equal(mapSendcloudStatus(11), 'DELIVERED')
  assert.equal(mapSendcloudStatus(80), 'EXCEPTION')
  assert.equal(mapSendcloudStatus(2000), 'CANCELLED')
})

test('mapSendcloudStatus: unknown codes fall back to LABEL_CREATED without throwing', () => {
  assert.equal(mapSendcloudStatus(99999), 'LABEL_CREATED')
})

function makeParcelResponse(overrides: Partial<SendcloudParcelResponse['parcel']> = {}): SendcloudParcelResponse {
  return {
    parcel: {
      id: 12345,
      tracking_number: 'TRK123',
      tracking_url: 'https://tracking.example/TRK123',
      label: { normal_printer: ['https://labels.example/12345.pdf'], label_printer: null },
      carrier: { code: 'correos' },
      status: { id: 1500, message: 'In transit' },
      ...overrides,
    },
  }
}

test('sendcloudToRecord builds the internal ShipmentRecord', () => {
  const rec = sendcloudToRecord(makeParcelResponse())
  assert.equal(rec.providerCode, 'SENDCLOUD')
  assert.equal(rec.providerRef, '12345')
  assert.equal(rec.status, 'IN_TRANSIT')
  assert.equal(rec.carrierName, 'correos')
  assert.equal(rec.trackingNumber, 'TRK123')
  assert.equal(rec.labelUrl, 'https://labels.example/12345.pdf')
  assert.equal(rec.labelFormat, 'pdf')
})

test('sendcloudToRecord handles missing label gracefully', () => {
  const rec = sendcloudToRecord(makeParcelResponse({ label: null }))
  assert.equal(rec.labelUrl, null)
  assert.equal(rec.labelFormat, null)
})

test('sendcloudToTracking surfaces the mapped status without history', () => {
  const tracking = sendcloudToTracking(makeParcelResponse({ status: { id: 11, message: 'Delivered' } }))
  assert.equal(tracking.status, 'DELIVERED')
  assert.equal(tracking.trackingNumber, 'TRK123')
  assert.deepEqual(tracking.history, [])
})
