import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recordSideEffects } from '@/domains/orders/side-effects'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('recordSideEffects batches order.created revalidations and notifications', () => {
  const sideEffects = recordSideEffects({
    kind: 'order.created',
    orderId: 'order_1',
    customerName: 'Ana',
    vendorIds: ['vendor_a', 'vendor_b'],
    fulfillmentByVendor: new Map([
      ['vendor_a', 'fulfillment_a'],
      ['vendor_b', 'fulfillment_b'],
    ]),
    lines: [
      { vendorId: 'vendor_a', unitPrice: 10, quantity: 2 },
      { vendorId: 'vendor_b', unitPrice: 7.5, quantity: 1 },
    ],
    productSlugs: ['manzanas'],
    vendorSlugs: ['granja'],
    stockLowCandidates: [
      {
        productId: 'product_1',
        vendorId: 'vendor_a',
        productName: 'Manzanas',
        remainingStock: 2,
      },
    ],
  })

  assert.deepEqual(sideEffects.revalidationPaths, [
    '/productos/manzanas',
    '/productores/granja',
    '/buscar',
    '/carrito',
  ])
  assert.equal(sideEffects.shouldRevalidateCatalogExperience, true)
  assert.deepEqual(sideEffects.notifications, [
    {
      event: 'order.created',
      payload: {
        orderId: 'order_1',
        vendorId: 'vendor_a',
        fulfillmentId: 'fulfillment_a',
        customerName: 'Ana',
        totalCents: 2000,
        currency: 'EUR',
      },
    },
    {
      event: 'order.created',
      payload: {
        orderId: 'order_1',
        vendorId: 'vendor_b',
        fulfillmentId: 'fulfillment_b',
        customerName: 'Ana',
        totalCents: 750,
        currency: 'EUR',
      },
    },
    {
      event: 'stock.low',
      payload: {
        productId: 'product_1',
        vendorId: 'vendor_a',
        productName: 'Manzanas',
        remainingStock: 2,
      },
    },
  ])
  assert.deepEqual(sideEffects.events, [])
})

test('recordSideEffects maps order confirmation and payment mismatch events', () => {
  assert.deepEqual(
    recordSideEffects({
      kind: 'order.confirmed',
      orderId: 'order_1',
    }),
    {
      shouldRevalidateCatalogExperience: true,
      revalidationPaths: ['/cuenta/pedidos', '/cuenta/pedidos/order_1', '/carrito'],
      notifications: [],
      events: [],
    }
  )

  const mismatch = recordSideEffects({
    kind: 'payment.mismatch',
    orderId: 'order_1',
    providerRef: 'pi_1',
    amount: 1099,
    expectedAmount: 10.99,
    expectedCurrency: 'EUR',
  })

  assert.equal(mismatch.revalidationPaths.length, 0)
  assert.equal(mismatch.shouldRevalidateCatalogExperience, false)
  assert.equal(mismatch.notifications.length, 0)
  assert.equal(mismatch.events.length, 1)
  assert.deepEqual(mismatch.events[0], {
    orderId: 'order_1',
    type: 'PAYMENT_MISMATCH',
    payload: {
      providerRef: 'pi_1',
      amount: 1099,
      expectedAmount: 10.99,
      expectedCurrency: 'EUR',
    },
  })
})

test('recordSideEffects captures payment intent failures as events', () => {
  const sideEffects = recordSideEffects({
    kind: 'payment.intent.failed',
    orderId: 'order_1',
    paymentError: new Error('stripe down'),
  })

  assert.deepEqual(sideEffects.revalidationPaths, [])
  assert.deepEqual(sideEffects.shouldRevalidateCatalogExperience, false)
  assert.deepEqual(sideEffects.notifications, [])
  assert.equal(sideEffects.events.length, 1)
  assert.deepEqual(sideEffects.events[0]?.orderId, 'order_1')
  assert.deepEqual(sideEffects.events[0]?.type, 'PAYMENT_INTENT_CREATION_FAILED')
  const payload = sideEffects.events[0]?.payload as
    | { error?: string; recordedAt?: string }
    | undefined
  assert.deepEqual(payload?.error, 'stripe down')
  assert.match(String(payload?.recordedAt), /\d{4}-\d{2}-\d{2}T/)
})

test('orders use-cases keep inline side effects out of the transactional flow', () => {
  const createOrderSource = readSource('../../src/domains/orders/use-cases/create-order.ts')
  const confirmOrderSource = readSource('../../src/domains/orders/use-cases/confirm-order.ts')
  const sideEffectsSource = readSource('../../src/domains/orders/side-effects.ts')

  assert.ok(!createOrderSource.includes('revalidateCatalogExperience('))
  assert.ok(!createOrderSource.includes('safeRevalidatePath('))
  assert.ok(!createOrderSource.includes('emitNotification('))
  assert.ok(createOrderSource.includes('recordOrderCreatedSideEffects('))
  assert.ok(createOrderSource.includes('recordPaymentIntentFailureSideEffects('))
  assert.ok(createOrderSource.includes('dispatchSideEffects(orderSideEffects, \'revalidations\')'))
  assert.ok(createOrderSource.includes('dispatchSideEffects(orderSideEffects, \'notifications\')'))

  assert.ok(!confirmOrderSource.includes('createPaymentMismatchEventPayload('))
  assert.ok(!confirmOrderSource.includes('revalidateCatalogExperience('))
  assert.ok(!confirmOrderSource.includes('safeRevalidatePath('))
  assert.ok(confirmOrderSource.includes('recordPaymentMismatchSideEffects('))
  assert.ok(confirmOrderSource.includes('recordOrderConfirmedSideEffects('))
  assert.ok(confirmOrderSource.includes('dispatchSideEffects('))
  assert.ok(confirmOrderSource.includes('shouldRevalidateCatalogExperience: false'))

  assert.ok(sideEffectsSource.includes('recordOrderCreatedSideEffects('))
  assert.ok(sideEffectsSource.includes('recordOrderConfirmedSideEffects('))
  assert.ok(sideEffectsSource.includes('recordPaymentIntentFailureSideEffects('))
  assert.ok(sideEffectsSource.includes('recordPaymentMismatchSideEffects('))
  assert.ok(sideEffectsSource.includes('recordSideEffects('))
  assert.ok(sideEffectsSource.includes('dispatchSideEffects('))
  assert.ok(sideEffectsSource.includes("revalidateCatalogExperience()"))
  assert.ok(sideEffectsSource.includes("emitNotification(notification.event, notification.payload)"))
})
