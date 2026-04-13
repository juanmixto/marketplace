import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWebhookDeadLetterRecord,
  recordWebhookDeadLetter,
  type WebhookDlqClient,
} from '@/domains/payments/webhook-dlq'

function createMockClient(options: { throwOnCreate?: boolean } = {}): {
  client: WebhookDlqClient
  writes: unknown[]
} {
  const writes: unknown[] = []
  const client: WebhookDlqClient = {
    webhookDeadLetter: {
      create: async (args: { data: unknown }) => {
        if (options.throwOnCreate) throw new Error('db down')
        writes.push(args.data)
        return args.data
      },
    },
  }
  return { client, writes }
}

test('buildWebhookDeadLetterRecord defaults provider to stripe and null-fills optional fields', () => {
  const record = buildWebhookDeadLetterRecord({
    eventType: 'payment_intent.succeeded',
    reason: 'payment_not_found',
  })
  assert.deepEqual(record, {
    provider: 'stripe',
    eventId: null,
    eventType: 'payment_intent.succeeded',
    providerRef: null,
    reason: 'payment_not_found',
    payload: null,
  })
})

test('buildWebhookDeadLetterRecord preserves provided fields', () => {
  const record = buildWebhookDeadLetterRecord({
    provider: 'paypal',
    eventId: 'evt_123',
    eventType: 'payment.captured',
    providerRef: 'pi_abc',
    reason: 'payment_not_found',
    payload: { foo: 'bar' },
  })
  assert.equal(record.provider, 'paypal')
  assert.equal(record.eventId, 'evt_123')
  assert.equal(record.providerRef, 'pi_abc')
  assert.deepEqual(record.payload, { foo: 'bar' })
})

test('recordWebhookDeadLetter writes to the delegate and returns true on success', async () => {
  const { client, writes } = createMockClient()
  const ok = await recordWebhookDeadLetter(client, {
    eventId: 'evt_1',
    eventType: 'payment_intent.payment_failed',
    providerRef: 'pi_xyz',
    reason: 'payment_not_found',
  })
  assert.equal(ok, true)
  assert.equal(writes.length, 1)
  assert.equal((writes[0] as { eventId: string }).eventId, 'evt_1')
  assert.equal((writes[0] as { provider: string }).provider, 'stripe')
})

test('recordWebhookDeadLetter swallows errors and returns false', async () => {
  const originalError = console.error
  console.error = () => undefined
  try {
    const { client } = createMockClient({ throwOnCreate: true })
    const ok = await recordWebhookDeadLetter(client, {
      eventType: 'payment_intent.succeeded',
      reason: 'payment_not_found',
    })
    assert.equal(ok, false)
  } finally {
    console.error = originalError
  }
})
