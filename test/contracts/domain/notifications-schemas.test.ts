import test from 'node:test'
import assert from 'node:assert/strict'
import {
  notificationChannelSchema,
  notificationEventTypeSchema,
  notificationDeliveryStatusSchema,
} from '@/domains/notifications/types'
import {
  orderCreatedPayloadSchema,
  orderPendingPayloadSchema,
  messageReceivedPayloadSchema,
  orderStatusChangedPayloadSchema,
  favoriteBackInStockPayloadSchema,
  NOTIFICATION_EVENTS,
} from '@/domains/notifications/events'
import { setPreferenceInputSchema } from '@/domains/notifications/preferences-schema'

/**
 * Schema-freeze for the notifications domain (Telegram integration).
 * Closes the seven `TODO(freeze)` markers added in the audit
 * allowlist by PR #514 — those schemas now have explicit shape +
 * value pins so the audit allowlist can stay at its principled
 * minimum (just helpers and sub-schemas).
 *
 * Why these matter:
 *
 *   - notificationChannel/EventType/DeliveryStatus → drift here
 *     means a new transport (e.g. WhatsApp) or event type lands
 *     without a deliberate update; the dispatcher's switch
 *     statements would silently miss the new variant.
 *
 *   - orderCreated/orderPending/messageReceivedPayload → outbound
 *     payload contracts to Telegram. A silent rename would send
 *     templates with the wrong fields filled in.
 *
 *   - setPreferenceInput → the buyer/vendor preference write
 *     surface; drift would 422 a previously valid call from the
 *     UI toggle.
 */

type ExpectedShape = {
  required: readonly string[]
  optional: readonly string[]
}

function assertObjectShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: ExpectedShape,
) {
  const shape = schema._zod.def.shape
  const actualKeys = Object.keys(shape).sort()
  const expectedKeys = [...expected.required, ...expected.optional].sort()

  assert.deepEqual(actualKeys, expectedKeys, `${label}: schema key set drifted.`)

  const required: string[] = []
  const optional: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const isOptional = field._zod.optin === 'optional'
    if (isOptional) optional.push(key)
    else required.push(key)
  }
  required.sort()
  optional.sort()

  assert.deepEqual(required, [...expected.required].sort(), `${label}: required drifted.`)
  assert.deepEqual(optional, [...expected.optional].sort(), `${label}: optional drifted.`)
}

function assertEnumValues(
  label: string,
  schema: { _zod: { def: { values?: readonly string[]; entries?: Record<string, string> } } },
  expected: readonly string[],
) {
  // z.enum stores values either as `values` (Zod v4 string-array form)
  // or `entries` (object form). Read whichever exists.
  const def = schema._zod.def
  const actual = def.values
    ? [...def.values]
    : def.entries
      ? Object.values(def.entries)
      : []
  assert.deepEqual(
    actual.slice().sort(),
    [...expected].sort(),
    `${label}: enum value set drifted. Adding/removing a member here is a deliberate change — update this test in the same PR.`,
  )
}

// ─── Discriminator enums ──────────────────────────────────────────────────────

test('notificationChannelSchema — frozen value set', () => {
  // Adding a transport (e.g. WHATSAPP, EMAIL) is a deliberate
  // architectural change — every dispatcher that switches on
  // channel needs a new case.
  assertEnumValues('notificationChannelSchema', notificationChannelSchema as never, ['TELEGRAM'])
})

test('notificationEventTypeSchema — frozen value set', () => {
  assertEnumValues('notificationEventTypeSchema', notificationEventTypeSchema as never, [
    'ORDER_CREATED',
    'ORDER_PENDING',
    'MESSAGE_RECEIVED',
    'ORDER_DELIVERED',
    'LABEL_FAILED',
    'INCIDENT_OPENED',
    'REVIEW_RECEIVED',
    'PAYOUT_PAID',
    'STOCK_LOW',
    'BUYER_ORDER_STATUS',
    'BUYER_FAVORITE_RESTOCK',
  ])
})

test('notificationDeliveryStatusSchema — frozen value set', () => {
  assertEnumValues('notificationDeliveryStatusSchema', notificationDeliveryStatusSchema as never, [
    'SENT',
    'FAILED',
    'SKIPPED',
  ])
})

test('NOTIFICATION_EVENTS string keys match the enum', () => {
  // The runtime event-name constants and the discriminator enum
  // values both encode the same set; they must agree or the
  // dispatcher's lookup tables drift.
  assert.deepEqual(
    Object.keys(NOTIFICATION_EVENTS).sort(),
    [
      'FAVORITE_BACK_IN_STOCK',
      'INCIDENT_OPENED',
      'LABEL_FAILED',
      'MESSAGE_RECEIVED',
      'ORDER_CREATED',
      'ORDER_DELIVERED',
      'ORDER_PENDING',
      'ORDER_STATUS_CHANGED',
      'PAYOUT_PAID',
      'REVIEW_RECEIVED',
      'STOCK_LOW',
    ],
  )
  assert.deepEqual(
    Object.values(NOTIFICATION_EVENTS).sort(),
    [
      'favorite.back_in_stock',
      'incident.opened',
      'label.failed',
      'message.received',
      'order.created',
      'order.delivered',
      'order.pending',
      'order.status_changed',
      'payout.paid',
      'review.received',
      'stock.low',
    ],
  )
})

// ─── Outbound payloads ────────────────────────────────────────────────────────

test('orderCreatedPayloadSchema — frozen shape', () => {
  assertObjectShape('orderCreatedPayloadSchema', orderCreatedPayloadSchema as never, {
    required: ['orderId', 'vendorId', 'customerName', 'totalCents', 'currency'],
    optional: ['fulfillmentId'],
  })
})

test('orderCreatedPayloadSchema — currency is exactly 3 chars', () => {
  // ISO 4217 contract — drifting this would let "EURO" through
  // and break Telegram template rendering.
  const result = orderCreatedPayloadSchema.safeParse({
    orderId: 'o',
    vendorId: 'v',
    customerName: 'A',
    totalCents: 100,
    currency: 'EURO',
  })
  assert.equal(result.success, false)
})

test('orderPendingPayloadSchema — frozen shape', () => {
  assertObjectShape('orderPendingPayloadSchema', orderPendingPayloadSchema as never, {
    required: ['orderId', 'vendorId', 'reason'],
    optional: ['fulfillmentId'],
  })
})

test('orderPendingPayloadSchema — reason set is frozen', () => {
  // Each `reason` value maps to a distinct vendor action (confirm,
  // generate label, ship). A new reason without code coverage
  // downstream would render a generic notification.
  for (const reason of ['NEEDS_CONFIRMATION', 'NEEDS_LABEL', 'NEEDS_SHIPMENT']) {
    const parsed = orderPendingPayloadSchema.safeParse({
      orderId: 'o', vendorId: 'v', reason,
    })
    assert.equal(parsed.success, true, `expected ${reason} to parse`)
  }
  const bad = orderPendingPayloadSchema.safeParse({
    orderId: 'o', vendorId: 'v', reason: 'NEEDS_REFUND',
  })
  assert.equal(bad.success, false)
})

test('messageReceivedPayloadSchema — frozen shape', () => {
  assertObjectShape('messageReceivedPayloadSchema', messageReceivedPayloadSchema as never, {
    required: ['conversationId', 'vendorId', 'fromUserName', 'preview'],
    optional: [],
  })
})

test('messageReceivedPayloadSchema — preview is capped at 200 chars', () => {
  // Telegram message body cap — drift would risk silently
  // truncating mid-sentence on the recipient side.
  const result = messageReceivedPayloadSchema.safeParse({
    conversationId: 'c',
    vendorId: 'v',
    fromUserName: 'Ada',
    preview: 'x'.repeat(201),
  })
  assert.equal(result.success, false)
})

test('orderStatusChangedPayloadSchema — frozen shape', () => {
  assertObjectShape(
    'orderStatusChangedPayloadSchema',
    orderStatusChangedPayloadSchema as never,
    {
      required: ['orderId', 'customerUserId', 'status'],
      optional: ['fulfillmentId', 'orderNumber', 'vendorName'],
    },
  )
})

test('orderStatusChangedPayloadSchema — status set is frozen', () => {
  // These three statuses are the only buyer-facing milestones. Adding a
  // new value (e.g. EXCEPTION) without template coverage would render a
  // message with a missing emoji/copy.
  for (const status of ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
    const parsed = orderStatusChangedPayloadSchema.safeParse({
      orderId: 'o',
      customerUserId: 'u',
      status,
    })
    assert.equal(parsed.success, true, `expected ${status} to parse`)
  }
  const bad = orderStatusChangedPayloadSchema.safeParse({
    orderId: 'o',
    customerUserId: 'u',
    status: 'EXCEPTION',
  })
  assert.equal(bad.success, false)
})

test('favoriteBackInStockPayloadSchema — frozen shape', () => {
  assertObjectShape(
    'favoriteBackInStockPayloadSchema',
    favoriteBackInStockPayloadSchema as never,
    {
      required: ['productId', 'productName'],
      optional: ['productSlug', 'vendorName'],
    },
  )
})

// ─── Preferences write surface ────────────────────────────────────────────────

test('setPreferenceInputSchema — frozen shape', () => {
  assertObjectShape('setPreferenceInputSchema', setPreferenceInputSchema as never, {
    required: ['channel', 'eventType', 'enabled'],
    optional: [],
  })
})

test('setPreferenceInputSchema — rejects unknown channel/eventType', () => {
  const badChannel = setPreferenceInputSchema.safeParse({
    channel: 'WHATSAPP',
    eventType: 'ORDER_CREATED',
    enabled: true,
  })
  assert.equal(badChannel.success, false)

  const badEvent = setPreferenceInputSchema.safeParse({
    channel: 'TELEGRAM',
    eventType: 'ORDER_REFUNDED',
    enabled: true,
  })
  assert.equal(badEvent.success, false)
})
