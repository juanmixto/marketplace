import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('orders page exposes a repeat purchase CTA and dedicated client action', () => {
  const ordersPage = readSource('../../src/app/(buyer)/cuenta/pedidos/page.tsx')
  const repeatButton = readSource('../../src/components/buyer/RepeatOrderButton.tsx')

  assert.match(ordersPage, /RepeatOrderButton/)
  assert.match(repeatButton, /t\('cart\.repeat\.button'\)/)
  assert.match(repeatButton, /useCartStore/)
  assert.match(repeatButton, /router\.push\('\/carrito'\)/)
})

test('order detail page serializes Prisma decimals before sending props to the client', () => {
  const orderDetailPage = readSource('../../src/app/(buyer)/cuenta/pedidos/[id]/page.tsx')

  assert.match(orderDetailPage, /const serializedOrder = \{/)
  assert.match(orderDetailPage, /subtotal: Number\(order\.subtotal\)/)
  assert.match(orderDetailPage, /shippingCost: Number\(order\.shippingCost\)/)
  assert.match(orderDetailPage, /grandTotal: Number\(order\.grandTotal\)/)
  assert.match(orderDetailPage, /unitPrice: Number\(line\.unitPrice\)/)
  assert.match(orderDetailPage, /order=\{serializedOrder\}/)
})
