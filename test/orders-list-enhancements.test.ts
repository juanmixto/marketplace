import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('orders list page renders product names alongside thumbnails', () => {
  const source = readSource('../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /line\.product\.name/)
  assert.match(source, /truncate/)
})

test('orders list page shows quantity per line item', () => {
  const source = readSource('../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /line\.quantity/)
})

test('orders list page shows item count summary with total articles and products', () => {
  const source = readSource('../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /totalItems/)
  assert.match(source, /productCount/)
  // Labels come from i18n now, so assert on the translation keys rather than literals.
  assert.match(source, /account\.ordersItem/)
  assert.match(source, /account\.ordersProduct/)
})

test('orders list page displays payment status badge', () => {
  const source = readSource('../src/app/(buyer)/cuenta/pedidos/page.tsx')

  assert.match(source, /PAYMENT_STATUS_LABELS/)
  assert.match(source, /order\.paymentStatus/)
  assert.match(source, /PAYMENT_STATUS_VARIANT/)
})

test('PAYMENT_STATUS_LABELS exists in shared constants with expected keys', () => {
  const source = readSource('../src/lib/constants.ts')

  assert.match(source, /PAYMENT_STATUS_LABELS/)
  assert.match(source, /PENDING/)
  assert.match(source, /SUCCEEDED/)
  assert.match(source, /FAILED/)
  assert.match(source, /REFUNDED/)
  assert.match(source, /PARTIALLY_REFUNDED/)
})
