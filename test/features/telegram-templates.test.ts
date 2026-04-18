import test from 'node:test'
import assert from 'node:assert/strict'
import {
  orderCreatedTemplate,
  orderPendingTemplate,
  messageReceivedTemplate,
  helpTemplate,
  statusTemplate,
} from '@/domains/notifications/telegram/templates'

const CALLBACK_BYTE_LIMIT = 64

function withAppUrl<T>(url: string | undefined, fn: () => T): T {
  const previous = process.env.NEXT_PUBLIC_APP_URL
  if (url === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL
  } else {
    process.env.NEXT_PUBLIC_APP_URL = url
  }

  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previous
    }
  }
}

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

test('helpTemplate exposes onboarding commands and app links', () => {
  const msg = withAppUrl('https://app.example.com', () => helpTemplate('bot_marketplace'))
  assert.ok(msg.text.includes('/status'), 'help mentions /status')
  assert.ok(msg.text.includes('/disconnect'), 'help mentions /disconnect')

  const buttons = (msg.inline_keyboard ?? []).flat().filter(
    (button): button is { text: string; url: string } => 'url' in button,
  )
  assert.deepEqual(
    buttons.map(button => button.text),
    ['Abrir ajustes', 'Ver notificaciones'],
  )
  assert.deepEqual(
    buttons.map(button => button.url),
    [
      'https://app.example.com/vendor/ajustes/telegram',
      'https://app.example.com/vendor/ajustes/notificaciones',
    ],
  )
})

test('statusTemplate describes linked and unlinked states', () => {
  const linked = withAppUrl('https://app.example.com', () =>
    statusTemplate({
      linked: true,
      username: 'producer',
      botUsername: 'bot_marketplace',
    }),
  )
  assert.ok(linked.text.includes('✅ Cuenta vinculada'))
  assert.ok(linked.text.includes('@producer'))

  const linkedButtons = (linked.inline_keyboard ?? []).flat().filter(
    (button): button is { text: string; url: string } => 'url' in button,
  )
  assert.deepEqual(
    linkedButtons.map(button => button.text),
    ['Ver notificaciones', 'Abrir Telegram'],
  )

  const unlinked = withAppUrl('https://app.example.com', () =>
    statusTemplate({
      linked: false,
      username: null,
      botUsername: 'bot_marketplace',
    }),
  )
  assert.ok(unlinked.text.includes('⚠️ Cuenta no vinculada'))
  assert.ok(unlinked.text.includes('/start <token>'))
  const unlinkedButtons = (unlinked.inline_keyboard ?? []).flat().filter(
    (button): button is { text: string; url: string } => 'url' in button,
  )
  assert.deepEqual(
    unlinkedButtons.map(button => button.text),
    ['Abrir ajustes', 'Ver notificaciones'],
  )
})

test('messageReceivedTemplate omits url button when app url is missing', () => {
  const msg = withAppUrl(undefined, () =>
    messageReceivedTemplate({
      conversationId: 'conv_1',
      vendorId: 'vnd_1',
      fromUserName: 'Alice',
      preview: 'hola',
    }),
  )
  assert.equal(msg.inline_keyboard, undefined)
})

test('order templates omit web links when app url is missing', () => {
  const created = withAppUrl(undefined, () =>
    orderCreatedTemplate({
      orderId: 'ord_12345678',
      vendorId: 'vnd_1',
      customerName: 'Alice',
      totalCents: 500,
      currency: 'EUR',
    }),
  )
  const pending = withAppUrl(undefined, () =>
    orderPendingTemplate({
      orderId: 'ord_12345678',
      vendorId: 'vnd_1',
      reason: 'NEEDS_SHIPMENT',
      fulfillmentId: 'ful_1',
    }),
  )

  const createdButtons = (created.inline_keyboard ?? []).flat()
  const pendingButtons = (pending.inline_keyboard ?? []).flat()
  assert.equal(createdButtons.some(button => 'url' in button), false)
  assert.equal(pendingButtons.some(button => 'url' in button), false)
  assert.equal(createdButtons.some(button => 'callback_data' in button), false)
  assert.equal(pendingButtons.some(button => 'callback_data' in button), true)
})
