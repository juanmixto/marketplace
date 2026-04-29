import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('orders list page renders product names alongside thumbnails', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /line\.product\.name/)
  assert.match(source, /truncate/)
})

test('orders list page shows quantity per line item', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /line\.quantity/)
})

test('orders list page shows item count summary with total articles and products', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /totalItems/)
  assert.match(source, /productCount/)
  // Labels come from i18n now, so assert on the translation keys rather than literals.
  assert.match(source, /account\.ordersItem/)
  assert.match(source, /account\.ordersProduct/)
})

test('orders list page collapses order + payment status into a single buyer-friendly badge', () => {
  const source = readSource('../../src/app/(buyer)/cuenta/pedidos/page.tsx')

  // Buyer cares about a single "what is the next thing to know" label, not
  // two parallel state machines. The helper getBuyerOrderStatus owns the rule
  // of how (Order.status, Payment.status) collapses; pages just consume it.
  assert.match(source, /getBuyerOrderStatus/)
  assert.doesNotMatch(
    source,
    /PAYMENT_STATUS_LABELS|PAYMENT_STATUS_VARIANT/,
    'buyer orders list must not render payment status as a second badge — admin views keep the desaggregated state instead',
  )
})

test('getBuyerOrderStatus helper exists and exposes label + variant', () => {
  const source = readSource('../../src/domains/orders/buyer-status.ts')

  assert.match(source, /export function getBuyerOrderStatus/)
  assert.match(source, /label/)
  assert.match(source, /variant/)
  // The rule is "payment dominates while not succeeded, otherwise show order
  // status" — this is the contract; if the rule changes, the test should
  // change too (deliberately, in the same PR).
  assert.match(source, /paymentStatus !== 'SUCCEEDED'/)
})

test('PAYMENT_STATUS_LABELS exists in shared constants with expected keys', () => {
  const source = readSource('../../src/lib/constants.ts')

  assert.match(source, /PAYMENT_STATUS_LABELS/)
  assert.match(source, /PENDING/)
  assert.match(source, /SUCCEEDED/)
  assert.match(source, /FAILED/)
  assert.match(source, /REFUNDED/)
  assert.match(source, /PARTIALLY_REFUNDED/)
})
