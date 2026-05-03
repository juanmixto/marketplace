import test from 'node:test'
import assert from 'node:assert/strict'
import { sendcloudWebhookPayloadSchema } from '@/domains/shipping/providers/sendcloud/webhook-schemas'

/**
 * Frozen schema for Sendcloud parcel-status webhook payloads. Drift
 * here would either reject real Sendcloud events at the boundary or
 * let malformed payloads through to the dead-letter queue with bad
 * shape — both are #568 regressions.
 */

function assertShape(
  label: string,
  schema: { _zod: { def: { shape: Record<string, { _zod: { optin?: string } }> } } },
  expected: { required: readonly string[]; optional: readonly string[] },
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

test('sendcloudWebhookPayloadSchema — frozen shape', () => {
  assertShape('sendcloudWebhookPayloadSchema', sendcloudWebhookPayloadSchema as never, {
    required: [],
    optional: ['action', 'timestamp', 'parcel'],
  })
})

test('sendcloudWebhookPayloadSchema — accepts a real-shaped parcel-status event', () => {
  const ok = sendcloudWebhookPayloadSchema.safeParse({
    action: 'parcel_status_changed',
    timestamp: 1_700_000_000,
    parcel: {
      id: 12345,
      tracking_number: 'AB123456789',
      status: { id: 1000, message: 'Announced' },
    },
  })
  assert.equal(ok.success, true)
})

test('sendcloudWebhookPayloadSchema — accepts payload with null tracking_number', () => {
  // Sendcloud sends `null` (not omitted) for parcels without a label yet.
  const ok = sendcloudWebhookPayloadSchema.safeParse({
    parcel: {
      id: 1,
      tracking_number: null,
      status: { id: 1, message: 'Ready to send' },
    },
  })
  assert.equal(ok.success, true)
})

test('sendcloudWebhookPayloadSchema — rejects parcel missing required status fields', () => {
  const result = sendcloudWebhookPayloadSchema.safeParse({
    parcel: {
      id: 1,
      status: { id: 1 },
    },
  })
  assert.equal(result.success, false)
})

test('sendcloudWebhookPayloadSchema — rejects parcel with non-numeric id', () => {
  const result = sendcloudWebhookPayloadSchema.safeParse({
    parcel: {
      id: 'not-a-number',
      status: { id: 1, message: 'ok' },
    },
  })
  assert.equal(result.success, false)
})
