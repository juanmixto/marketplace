/**
 * Dead-letter helper for Stripe webhook events that cannot be reconciled
 * to an existing Payment/Order row. Used by the webhook route handler as
 * a last resort so orphan events can be replayed manually by an operator.
 */

type WebhookDeadLetterInput = {
  provider?: string
  eventId?: string
  eventType: string
  providerRef?: string
  reason: string
  payload?: unknown
}

type WebhookDeadLetterRecord = {
  provider: string
  eventId: string | null
  eventType: string
  providerRef: string | null
  reason: string
  payload: unknown
}

// Loose structural type so the real Prisma delegate (which has generics we
// don't care about) and simple in-memory mocks both satisfy it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebhookDeadLetterDelegate = { create: (args: any) => Promise<any> }

export type WebhookDlqClient = { webhookDeadLetter: WebhookDeadLetterDelegate }

export function buildWebhookDeadLetterRecord(input: WebhookDeadLetterInput): WebhookDeadLetterRecord {
  return {
    provider: input.provider ?? 'stripe',
    eventId: input.eventId ?? null,
    eventType: input.eventType,
    providerRef: input.providerRef ?? null,
    reason: input.reason,
    payload: input.payload ?? null,
  }
}

/**
 * Persist an orphan webhook event. Swallows errors (and logs them) so the
 * caller can still acknowledge the webhook with a 200 — otherwise Stripe
 * would keep retrying an event we cannot process anyway.
 */
export async function recordWebhookDeadLetter(
  client: WebhookDlqClient,
  input: WebhookDeadLetterInput
): Promise<boolean> {
  try {
    await client.webhookDeadLetter.create({ data: buildWebhookDeadLetterRecord(input) })
    return true
  } catch (err) {
    console.error('[stripe-webhook][dead-letter-write-failed]', {
      eventId: input.eventId ?? null,
      eventType: input.eventType,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
