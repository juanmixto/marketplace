import { z } from 'zod'

/**
 * Boundary schema for Stripe webhook events.
 *
 * Scope: validate the SHAPE of the event envelope our handler reads —
 * `id`, `type`, `created`, and `data.object` — not the full Stripe API.
 * Per-`type` payloads (`PaymentIntent`, `Subscription`, `Invoice`) are
 * already runtime-validated downstream by their dedicated parsers in
 * `src/domains/payments/webhook.ts` and `src/domains/subscriptions/`.
 *
 * `data.object` is intentionally `z.unknown()` here: the dispatcher
 * branches on `event.type` before handing the object to a typed parser
 * that knows what to look for. Modelling each variant at this layer
 * would duplicate that work and grow with every new event subscription.
 *
 * Failure mode: a signature-verified event whose envelope can't be
 * parsed lands in the dead-letter queue (see `route.ts`); we never
 * silently drop a payment confirmation.
 */
export const stripeWebhookEventSchema = z.object({
  // `id` is optional because mock-provider tests synthesize events
  // without one; the route falls back to a hash-derived id for
  // idempotency in that case (see `route.ts` near `synthetic_`).
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  created: z.number().optional(),
  data: z.object({
    object: z.unknown(),
  }),
})

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSchema>
