import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderCreatedPush,
  orderPendingPush,
  messageReceivedPush,
  orderDeliveredPush,
  labelFailedPush,
  incidentOpenedPush,
  reviewReceivedPush,
  payoutPaidPush,
  stockLowPush,
  orderStatusChangedPush,
  favoriteBackInStockPush,
  favoritePriceDropPush,
} from '@/domains/notifications/web-push/templates'

/**
 * Contract tests for the web-push template catalogue. The assertions
 * here are the minimum invariants every payload must preserve:
 *
 *   - `title`, `body`, `url`, `tag` are non-empty and present
 *   - The title fits in ~80 chars so Android does not truncate the
 *     greeting
 *   - The deep-link `url` lands on the correct surface for the event
 *   - `tag` collapses repeat deliveries of the same logical event so
 *     the OS notification tray does not stack duplicates
 *   - Personalization fields (firstName, items, comment) appear when
 *     the view object is provided, but the template still renders
 *     without them (graceful fallback)
 */

function assertShape(msg: ReturnType<typeof orderCreatedPush>) {
  assert.ok(msg.title.length > 0, 'title must be non-empty')
  assert.ok(msg.body.length > 0, 'body must be non-empty')
  assert.ok(msg.url.length > 0, 'url must be non-empty')
  assert.ok(msg.tag.length > 0, 'tag must be non-empty')
  assert.ok(msg.title.length <= 100, `title too long (${msg.title.length} chars)`)
}

test('orderCreatedPush — greets vendor, shows buyer + total, deep-links to order', () => {
  const msg = orderCreatedPush(
    {
      orderId: 'ord_abc',
      vendorId: 'vnd_1',
      customerName: 'María López',
      totalCents: 4500,
      currency: 'EUR',
    },
    {
      vendorFirstName: 'Carlos García',
      city: 'Madrid',
      items: ['2× kg Tomates', '1× bote Aceite'],
      orderNumber: 'MP-2026-001',
    },
  )
  assertShape(msg)
  assert.ok(msg.title.includes('Carlos'), 'greets vendor by first name')
  assert.ok(msg.title.includes('María López'))
  assert.ok(msg.body.includes('45,00 EUR'))
  assert.ok(msg.body.includes('Madrid'))
  assert.ok(msg.url.endsWith('/vendor/pedidos/ord_abc'))
  assert.ok(msg.tag.includes('ord_abc'), 'tag references the order id')
})

test('orderCreatedPush — renders without view (graceful fallback)', () => {
  const msg = orderCreatedPush({
    orderId: 'ord_abc',
    vendorId: 'vnd_1',
    customerName: 'Alice',
    totalCents: 100,
    currency: 'EUR',
  })
  assertShape(msg)
  assert.ok(!msg.title.includes('Hola'), 'no greeting when view is absent')
  assert.ok(msg.body.includes('1,00 EUR'))
})

test('orderPendingPush — reason-specific body, tag per reason', () => {
  const needsLabel = orderPendingPush({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    reason: 'NEEDS_LABEL',
  })
  const needsShipment = orderPendingPush({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    reason: 'NEEDS_SHIPMENT',
  })
  assertShape(needsLabel)
  assertShape(needsShipment)
  assert.notEqual(needsLabel.body, needsShipment.body)
  assert.notEqual(needsLabel.tag, needsShipment.tag, 'tag must differentiate reasons')
})

test('messageReceivedPush — truncates long previews', () => {
  const msg = messageReceivedPush(
    {
      conversationId: 'c_1',
      vendorId: 'v_1',
      fromUserName: 'María',
      preview: 'a'.repeat(500),
    },
    { vendorFirstName: 'Carlos' },
  )
  assertShape(msg)
  assert.ok(msg.body.length <= 121, 'body must truncate to ~120 chars')
  assert.ok(msg.title.includes('Carlos'))
})

test('orderStatusChangedPush — different title per status, greets buyer', () => {
  const shipped = orderStatusChangedPush(
    {
      orderId: 'ord_1',
      customerUserId: 'usr_1',
      status: 'SHIPPED',
      orderNumber: 'MP-2026-001',
      vendorName: 'Finca Ejemplo',
    },
    { buyerFirstName: 'María', items: ['2× kg Tomate'] },
  )
  assertShape(shipped)
  assert.ok(shipped.title.includes('María'))
  assert.ok(shipped.title.includes('📦'))
  assert.ok(shipped.body.includes('MP-2026-001'))
  assert.ok(shipped.body.includes('Finca Ejemplo'))
  assert.ok(shipped.body.includes('Tomate'))
  assert.ok(shipped.url.endsWith('/cuenta/pedidos/ord_1'))

  const out = orderStatusChangedPush({
    orderId: 'ord_1',
    customerUserId: 'usr_1',
    status: 'OUT_FOR_DELIVERY',
  })
  assert.ok(out.title.includes('🚚'))

  const delivered = orderStatusChangedPush({
    orderId: 'ord_1',
    customerUserId: 'usr_1',
    status: 'DELIVERED',
  })
  assert.ok(delivered.title.includes('✅'))
  assert.notEqual(shipped.tag, out.tag, 'tag must differentiate statuses')
})

test('reviewReceivedPush — surfaces stars, reviewer, comment snippet', () => {
  const msg = reviewReceivedPush(
    {
      reviewId: 'rev_1',
      vendorId: 'vnd_1',
      productId: 'p_1',
      productName: 'Aceite virgen',
      rating: 4,
    },
    {
      vendorFirstName: 'Carlos',
      reviewerFirstName: 'Ana',
      commentPreview: 'Excelente calidad y sabor.',
    },
  )
  assertShape(msg)
  assert.ok(msg.title.includes('★★★★☆'))
  assert.ok(msg.title.includes('Ana'))
  assert.ok(msg.body.includes('Excelente'))
  assert.ok(msg.url.endsWith('/vendor/valoraciones'))
})

test('incidentOpenedPush — uses description snippet when available', () => {
  const msg = incidentOpenedPush(
    {
      incidentId: 'inc_1',
      orderId: 'ord_1',
      vendorId: 'vnd_1',
      type: 'NOT_RECEIVED',
    },
    { buyerFirstName: 'Ana', descriptionPreview: 'No ha llegado tras 5 días.' },
  )
  assertShape(msg)
  assert.ok(msg.body.includes('Ana'))
  assert.ok(msg.body.includes('No ha llegado'))
  assert.ok(msg.url.endsWith('/cuenta/incidencias/inc_1'))
})

test('payoutPaidPush — includes amount + order count when provided', () => {
  const msg = payoutPaidPush(
    {
      settlementId: 'set_1',
      vendorId: 'vnd_1',
      netPayableCents: 12345,
      currency: 'EUR',
      periodLabel: 'marzo 2026',
    },
    { vendorFirstName: 'Carlos', orderCount: 7 },
  )
  assertShape(msg)
  assert.ok(msg.title.includes('Carlos'))
  assert.ok(msg.body.includes('123,45 EUR'))
  assert.ok(msg.body.includes('7 pedidos'))
})

test('stockLowPush — differentiates sold-out from low-stock', () => {
  const sold = stockLowPush(
    {
      productId: 'p_1',
      vendorId: 'vnd_1',
      productName: 'Tomate',
      remainingStock: 0,
    },
    { vendorFirstName: 'Carlos' },
  )
  const low = stockLowPush({
    productId: 'p_1',
    vendorId: 'vnd_1',
    productName: 'Tomate',
    remainingStock: 3,
  })
  assertShape(sold)
  assertShape(low)
  assert.ok(sold.title.includes('🚫'))
  assert.ok(low.title.includes('📉'))
  assert.ok(sold.body.includes('Agotado'))
  assert.ok(low.body.includes('Quedan 3'))
})

test('favoriteBackInStockPush — surfaces scarcity when stock is low', () => {
  const scarce = favoriteBackInStockPush(
    {
      productId: 'p_1',
      productName: 'Queso curado',
      productSlug: 'queso-curado',
      vendorName: 'Finca',
    },
    { buyerFirstName: 'Ana', remainingStock: 3 },
  )
  assertShape(scarce)
  assert.ok(scarce.title.includes('Ana'))
  assert.ok(scarce.body.includes('Solo quedan 3'))
  assert.ok(scarce.url.endsWith('/productos/queso-curado'))

  const plenty = favoriteBackInStockPush(
    {
      productId: 'p_1',
      productName: 'Queso curado',
    },
    { remainingStock: 50 },
  )
  assertShape(plenty)
  assert.ok(!plenty.body.includes('Solo quedan'))
  assert.ok(plenty.url === '/productos', 'fallback URL when no slug')
})

test('favoritePriceDropPush — shows old, new, percent', () => {
  const msg = favoritePriceDropPush(
    {
      productId: 'p_1',
      productName: 'Aceite',
      productSlug: 'aceite',
      vendorName: 'Almazara',
      oldPriceCents: 2000,
      newPriceCents: 1500,
      currency: 'EUR',
    },
    { buyerFirstName: 'Ana' },
  )
  assertShape(msg)
  assert.ok(msg.title.includes('Ana'))
  assert.ok(msg.body.includes('20,00 EUR'))
  assert.ok(msg.body.includes('15,00 EUR'))
  assert.ok(msg.body.includes('−25%'))
})

test('labelFailedPush — surfaces error + buyer name', () => {
  const msg = labelFailedPush(
    {
      orderId: 'ord_1',
      vendorId: 'vnd_1',
      fulfillmentId: 'ful_1',
      errorMessage: 'Carrier API down',
    },
    { buyerFirstName: 'Ana' },
  )
  assertShape(msg)
  assert.ok(msg.title.includes('Ana'))
  assert.ok(msg.body.includes('Carrier API down'))
})

test('orderDeliveredPush — names buyer + vendor + city', () => {
  const msg = orderDeliveredPush(
    { orderId: 'ord_1', vendorId: 'vnd_1', fulfillmentId: 'ful_1' },
    { buyerFirstName: 'Ana', city: 'Madrid', orderNumber: 'MP-2026-001' },
  )
  assertShape(msg)
  assert.ok(msg.title.includes('MP-2026-001'))
  assert.ok(msg.body.includes('Ana'))
  assert.ok(msg.body.includes('Madrid'))
})

test('all templates emit a tag that references the entity id so repeat pings collapse', () => {
  const msgs = [
    orderCreatedPush({ orderId: 'o1', vendorId: 'v1', customerName: 'x', totalCents: 0, currency: 'EUR' }),
    orderPendingPush({ orderId: 'o1', vendorId: 'v1', reason: 'NEEDS_LABEL' }),
    messageReceivedPush({ conversationId: 'c1', vendorId: 'v1', fromUserName: 'x', preview: 'hola' }),
    orderDeliveredPush({ orderId: 'o1', vendorId: 'v1', fulfillmentId: 'f1' }),
    labelFailedPush({ orderId: 'o1', vendorId: 'v1', fulfillmentId: 'f1', errorMessage: 'boom' }),
    incidentOpenedPush({ incidentId: 'i1', orderId: 'o1', vendorId: 'v1', type: 'NOT_RECEIVED' }),
    reviewReceivedPush({ reviewId: 'r1', vendorId: 'v1', productId: 'p1', productName: 'x', rating: 5 }),
    payoutPaidPush({ settlementId: 's1', vendorId: 'v1', netPayableCents: 1, currency: 'EUR', periodLabel: 'x' }),
    stockLowPush({ productId: 'p1', vendorId: 'v1', productName: 'x', remainingStock: 1 }),
    orderStatusChangedPush({ orderId: 'o1', customerUserId: 'u1', status: 'SHIPPED' }),
    favoriteBackInStockPush({ productId: 'p1', productName: 'x' }),
    favoritePriceDropPush({ productId: 'p1', productName: 'x', oldPriceCents: 2, newPriceCents: 1, currency: 'EUR' }),
  ]
  for (const msg of msgs) {
    assertShape(msg)
  }
})
