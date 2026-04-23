import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('order/payment state machine is documented and referenced from the Stripe webhook', () => {
  const doc = readSource('../../docs/order-payment-state-machine.md')
  const route = readSource('../../src/app/api/webhooks/stripe/route.ts')
  const confirmOrder = readSource('../../src/domains/orders/use-cases/confirm-order.ts')
  const webhookDomain = readSource('../../src/domains/payments/webhook.ts')

  assert.match(doc, /Order and payment state machine/)
  assert.match(doc, /Order\.status/)
  assert.match(doc, /Order\.paymentStatus/)
  assert.match(doc, /PLACED/)
  assert.match(doc, /PAYMENT_CONFIRMED/)
  assert.match(doc, /CANCELLED/)
  assert.match(doc, /REFUNDED/)
  assert.match(doc, /payment_intent\.succeeded/)
  assert.match(doc, /payment_intent\.payment_failed/)
  assert.match(doc, /Invalid transitions/)
  assert.match(route, /docs\/order-payment-state-machine\.md/)
  assert.match(confirmOrder, /shouldApplyPaymentSucceeded/)
  assert.match(webhookDomain, /shouldApplyPaymentSucceeded/)
  assert.match(webhookDomain, /shouldApplyPaymentFailed/)
})
