import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderCreatedTemplate,
  orderPendingTemplate,
  messageReceivedTemplate,
  orderStatusChangedTemplate,
  favoriteBackInStockTemplate,
  favoritePriceDropTemplate,
  orderDeliveredTemplate,
  labelFailedTemplate,
  incidentOpenedTemplate,
  reviewReceivedTemplate,
  payoutPaidTemplate,
  stockLowTemplate,
} from '@/domains/notifications/telegram/templates'

const CALLBACK_BYTE_LIMIT = 64

test('orderCreatedTemplate escapes HTML in customer name', () => {
  const msg = orderCreatedTemplate({
    orderId: 'ord_ABC',
    vendorId: 'vnd_1',
    customerName: '<script>alert("xss")</script>',
    totalCents: 4500,
    currency: 'EUR',
  })
  assert.ok(!msg.text.includes('<script>'), 'raw <script> must be escaped out')
  assert.ok(msg.text.includes('&lt;script&gt;'), 'must include the escaped form')
})

test('orderCreatedTemplate includes confirm callback when fulfillmentId present', () => {
  const msg = orderCreatedTemplate({
    orderId: 'ord_ABC',
    vendorId: 'vnd_1',
    fulfillmentId: 'ful_XYZ',
    customerName: 'Alice',
    totalCents: 100,
    currency: 'EUR',
  })
  const buttons = (msg.inline_keyboard ?? []).flat()
  const confirm = buttons.find(b => 'callback_data' in b)
  assert.ok(confirm, 'confirm button must exist when fulfillmentId is set')
  assert.equal(
    'callback_data' in confirm! ? confirm.callback_data : '',
    'confirmFulfillment:ful_XYZ',
    'callback_data shape is "confirmFulfillment:<fulfillmentId>"',
  )
})

test('orderCreatedTemplate omits confirm button when fulfillmentId is missing', () => {
  const msg = orderCreatedTemplate({
    orderId: 'ord_ABC',
    vendorId: 'vnd_1',
    customerName: 'Alice',
    totalCents: 100,
    currency: 'EUR',
  })
  const buttons = (msg.inline_keyboard ?? []).flat()
  const hasCallback = buttons.some(b => 'callback_data' in b)
  assert.equal(hasCallback, false, 'no callback button without a fulfillmentId')
})

test('orderCreatedTemplate formats money and uses last 8 chars of id', () => {
  const msg = orderCreatedTemplate({
    orderId: 'prefix_longABC12345',
    vendorId: 'vnd_1',
    customerName: 'Alice',
    totalCents: 4500,
    currency: 'EUR',
  })
  assert.ok(msg.text.includes('45,00 EUR'), 'money format is "45,00 EUR"')
  assert.ok(msg.text.includes('ABC12345'), 'uses last 8 characters of orderId (uppercased)')
})

test('every callback_data payload fits within the 64-byte Telegram limit', () => {
  const longOrderId = 'ord_' + 'x'.repeat(40)
  const templates = [
    orderCreatedTemplate({
      orderId: longOrderId,
      vendorId: 'vnd_1',
      customerName: 'Alice',
      totalCents: 100,
      currency: 'EUR',
    }),
    orderPendingTemplate({
      orderId: longOrderId,
      vendorId: 'vnd_1',
      reason: 'NEEDS_CONFIRMATION',
    }),
    messageReceivedTemplate({
      conversationId: 'conv_x',
      vendorId: 'vnd_1',
      fromUserName: 'Alice',
      preview: 'hello',
    }),
  ]

  for (const msg of templates) {
    for (const row of msg.inline_keyboard ?? []) {
      for (const button of row) {
        if ('callback_data' in button) {
          assert.ok(
            Buffer.byteLength(button.callback_data, 'utf8') <= CALLBACK_BYTE_LIMIT,
            `callback_data "${button.callback_data}" exceeds ${CALLBACK_BYTE_LIMIT} bytes`,
          )
        }
      }
    }
  }
})

test('orderPendingTemplate includes markShipped button only for NEEDS_SHIPMENT with fulfillmentId', () => {
  const withFul = orderPendingTemplate({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    fulfillmentId: 'ful_XYZ',
    reason: 'NEEDS_SHIPMENT',
  })
  const needsConfirm = orderPendingTemplate({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    fulfillmentId: 'ful_XYZ',
    reason: 'NEEDS_CONFIRMATION',
  })
  const noFul = orderPendingTemplate({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    reason: 'NEEDS_SHIPMENT',
  })

  const callbacksOf = (msg: { inline_keyboard?: Array<Array<unknown>> }) =>
    (msg.inline_keyboard ?? [])
      .flat()
      .filter((b): b is { callback_data: string } =>
        typeof b === 'object' && b !== null && 'callback_data' in b,
      )
      .map(b => b.callback_data)

  assert.deepEqual(callbacksOf(withFul), ['markShipped:ful_XYZ'])
  assert.deepEqual(callbacksOf(needsConfirm), [])
  assert.deepEqual(callbacksOf(noFul), [])
})

test('orderPendingTemplate picks copy based on reason', () => {
  const needsConfirm = orderPendingTemplate({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    reason: 'NEEDS_CONFIRMATION',
  })
  const needsShipment = orderPendingTemplate({
    orderId: 'ord_1',
    vendorId: 'vnd_1',
    reason: 'NEEDS_SHIPMENT',
  })
  assert.notEqual(needsConfirm.text, needsShipment.text)
})

test('messageReceivedTemplate truncates preview to 120 chars and escapes it', () => {
  const msg = messageReceivedTemplate({
    conversationId: 'conv_1',
    vendorId: 'vnd_1',
    fromUserName: '<Juan>',
    preview: '<i>' + 'a'.repeat(200) + '</i>',
  })
  assert.ok(msg.text.includes('&lt;Juan&gt;'), 'sender name escaped')
  // Template wraps the sender name in <b>…</b>; the assertion targets
  // a tag (<i>) that would only appear if the user-controlled preview
  // wasn't escaped.
  assert.ok(!msg.text.includes('<i>'), 'raw HTML in user preview is escaped')
  // preview sliced to 120 chars → no closing </i> survives
  assert.ok(!msg.text.includes('</i>'), 'preview is truncated before the closing tag')
})

test('orderStatusChangedTemplate renders per-status buyer copy', () => {
  const shipped = orderStatusChangedTemplate({
    orderId: 'ord_1',
    customerUserId: 'usr_1',
    status: 'SHIPPED',
    orderNumber: 'MP-2026-000001',
  })
  assert.ok(shipped.text.includes('📦'))
  assert.ok(shipped.text.includes('en camino'))
  assert.ok(shipped.text.includes('MP-2026-000001'))

  const out = orderStatusChangedTemplate({
    orderId: 'ord_1',
    customerUserId: 'usr_1',
    status: 'OUT_FOR_DELIVERY',
  })
  assert.ok(out.text.includes('🚚'))

  const delivered = orderStatusChangedTemplate({
    orderId: 'ord_1',
    customerUserId: 'usr_1',
    status: 'DELIVERED',
    vendorName: 'Finca <Ejemplo>',
  })
  assert.ok(delivered.text.includes('✅'))
  // vendor name must be HTML-escaped in the rendered body
  assert.ok(!delivered.text.includes('<Ejemplo>'))
  assert.ok(delivered.text.includes('Finca &lt;Ejemplo&gt;'))
})

test('favoriteBackInStockTemplate renders name + vendor and skips button without slug', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
  const withSlug = favoriteBackInStockTemplate({
    productId: 'p_1',
    productName: 'Queso curado',
    productSlug: 'queso-curado',
    vendorName: 'Finca Ejemplo',
  })
  assert.ok(withSlug.text.includes('🎉'))
  assert.ok(withSlug.text.includes('Queso curado'))
  assert.ok(withSlug.text.includes('Finca Ejemplo'))
  const buttons = (withSlug.inline_keyboard ?? []).flat()
  assert.equal(buttons.length, 1)

  const withoutSlug = favoriteBackInStockTemplate({
    productId: 'p_1',
    productName: 'Queso <curado>',
  })
  // No slug → no CTA button, and the name is HTML-escaped.
  assert.equal(withoutSlug.inline_keyboard, undefined)
  assert.ok(!withoutSlug.text.includes('<curado>'))
  assert.ok(withoutSlug.text.includes('&lt;curado&gt;'))
})

test('orderCreatedTemplate greets vendor by first name when view is provided', () => {
  const msg = orderCreatedTemplate(
    {
      orderId: 'ord_1',
      vendorId: 'vnd_1',
      customerName: 'Alice',
      totalCents: 4500,
      currency: 'EUR',
    },
    { vendorFirstName: 'Pedro García', buyerFirstName: 'Alice', city: 'Sevilla' },
  )
  assert.ok(msg.text.includes('¡Hola Pedro!'), 'greets vendor by first word only')
  assert.ok(msg.text.includes('Alice'), 'includes buyer name')
  assert.ok(msg.text.includes('Sevilla'), 'includes city')
})

test('orderCreatedTemplate escapes a hostile vendor name in the greeting', () => {
  const msg = orderCreatedTemplate(
    {
      orderId: 'ord_1',
      vendorId: 'vnd_1',
      customerName: 'Alice',
      totalCents: 100,
      currency: 'EUR',
    },
    { vendorFirstName: '<script>' },
  )
  assert.ok(!msg.text.includes('<script>'), 'raw <script> must not appear')
  assert.ok(msg.text.includes('&lt;script&gt;'))
})

test('reviewReceivedTemplate includes reviewer name and comment preview', () => {
  const msg = reviewReceivedTemplate(
    {
      reviewId: 'rev_1',
      vendorId: 'vnd_1',
      productId: 'p_1',
      productName: 'Aceite',
      rating: 5,
    },
    {
      vendorFirstName: 'Pedro',
      reviewerFirstName: 'Ana',
      commentPreview: 'Me ha encantado la calidad del producto.',
    },
  )
  assert.ok(msg.text.includes('Pedro'))
  assert.ok(msg.text.includes('Ana'))
  assert.ok(msg.text.includes('Me ha encantado'))
  assert.ok(msg.text.includes('🎉'), '5-star reviews close on a celebratory note')
})

test('reviewReceivedTemplate nudges vendor to check low-rating reviews', () => {
  const msg = reviewReceivedTemplate(
    {
      reviewId: 'rev_1',
      vendorId: 'vnd_1',
      productId: 'p_1',
      productName: 'Aceite',
      rating: 2,
    },
    { vendorFirstName: 'Pedro' },
  )
  assert.ok(msg.text.includes('Échale un ojo'))
})

test('incidentOpenedTemplate names the buyer and shows the description snippet', () => {
  const msg = incidentOpenedTemplate(
    {
      incidentId: 'inc_1',
      orderId: 'ord_1',
      vendorId: 'vnd_1',
      type: 'NOT_RECEIVED',
    },
    {
      vendorFirstName: 'Pedro',
      buyerFirstName: 'Ana',
      descriptionPreview: 'No ha llegado tras 5 días.',
    },
  )
  assert.ok(msg.text.includes('Ana'))
  assert.ok(msg.text.includes('No ha llegado'))
})

test('payoutPaidTemplate shows the order count in the period', () => {
  const msg = payoutPaidTemplate(
    {
      settlementId: 'set_1',
      vendorId: 'vnd_1',
      netPayableCents: 12345,
      currency: 'EUR',
      periodLabel: '2026-03-01 — 2026-03-31',
    },
    { vendorFirstName: 'Pedro', orderCount: 7 },
  )
  assert.ok(msg.text.includes('Pedro'))
  assert.ok(msg.text.includes('7 pedidos liquidados'))
})

test('orderStatusChangedTemplate greets the buyer and lists items', () => {
  const msg = orderStatusChangedTemplate(
    {
      orderId: 'ord_1',
      customerUserId: 'usr_1',
      status: 'SHIPPED',
      orderNumber: 'MP-2026-000001',
    },
    { buyerFirstName: 'Ana López', items: ['2× kg Tomates', '1× bote Aceite'] },
  )
  assert.ok(msg.text.includes('¡Hola Ana!'), 'greets buyer by first word')
  assert.ok(msg.text.includes('• 2× kg Tomates'), 'lists ordered items')
})

test('favoriteBackInStockTemplate surfaces scarcity when stock is low', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
  const scarce = favoriteBackInStockTemplate(
    {
      productId: 'p_1',
      productName: 'Queso curado',
      productSlug: 'queso-curado',
      vendorName: 'Finca Ejemplo',
    },
    { buyerFirstName: 'Ana', remainingStock: 3 },
  )
  assert.ok(scarce.text.includes('Ana'))
  assert.ok(scarce.text.includes('Solo quedan <b>3</b>'))

  const plenty = favoriteBackInStockTemplate(
    {
      productId: 'p_1',
      productName: 'Queso curado',
      productSlug: 'queso-curado',
    },
    { remainingStock: 50 },
  )
  assert.ok(!plenty.text.includes('Solo quedan'), 'scarcity copy skipped when stock is comfortable')
})

test('stockLowTemplate differs between sold-out and low-stock cases', () => {
  const sold = stockLowTemplate(
    { productId: 'p_1', vendorId: 'vnd_1', productName: 'Tomate', remainingStock: 0 },
    { vendorFirstName: 'Pedro' },
  )
  assert.ok(sold.text.includes('agotado'))
  assert.ok(sold.text.includes('Reponlo'))

  const low = stockLowTemplate(
    { productId: 'p_1', vendorId: 'vnd_1', productName: 'Tomate', remainingStock: 3 },
  )
  assert.ok(low.text.includes('Quedan <b>3</b>'))
})

test('orderDeliveredTemplate personalises the closer with the buyer name', () => {
  const msg = orderDeliveredTemplate(
    { orderId: 'ord_1', vendorId: 'vnd_1', fulfillmentId: 'ful_1' },
    { vendorFirstName: 'Pedro', buyerFirstName: 'Ana', city: 'Sevilla' },
  )
  assert.ok(msg.text.includes('Ana'))
  assert.ok(msg.text.includes('Sevilla'))
  assert.ok(msg.text.includes('¡Buen trabajo!'))
})

test('labelFailedTemplate still exposes retry callback and names the buyer', () => {
  const msg = labelFailedTemplate(
    {
      orderId: 'ord_1',
      vendorId: 'vnd_1',
      fulfillmentId: 'ful_1',
      errorMessage: 'API down',
    },
    { vendorFirstName: 'Pedro', buyerFirstName: 'Ana' },
  )
  assert.ok(msg.text.includes('Ana'))
  const buttons = (msg.inline_keyboard ?? []).flat()
  const retry = buttons.find(b => 'callback_data' in b)
  assert.ok(retry)
})

test('messageReceivedTemplate greets vendor when view is provided', () => {
  const msg = messageReceivedTemplate(
    { conversationId: 'c_1', vendorId: 'v_1', fromUserName: 'Ana', preview: 'Hola' },
    { vendorFirstName: 'Pedro', orderNumber: 'MP-2026-001' },
  )
  assert.ok(msg.text.includes('Pedro'))
  assert.ok(msg.text.includes('MP-2026-001'))
})

test('favoritePriceDropTemplate renders both prices and percent drop', () => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
  const msg = favoritePriceDropTemplate({
    productId: 'p_1',
    productName: 'Aceite virgen extra',
    productSlug: 'aceite-virgen-extra',
    vendorName: 'Almazara Ejemplo',
    oldPriceCents: 2000,
    newPriceCents: 1500,
    currency: 'EUR',
  })
  assert.ok(msg.text.includes('💸'))
  assert.ok(msg.text.includes('20,00 EUR'), 'old price rendered')
  assert.ok(msg.text.includes('15,00 EUR'), 'new price rendered')
  assert.ok(msg.text.includes('−25%'), 'percentage rounded from (20-15)/20')
  const buttons = (msg.inline_keyboard ?? []).flat()
  assert.equal(buttons.length, 1)
})
