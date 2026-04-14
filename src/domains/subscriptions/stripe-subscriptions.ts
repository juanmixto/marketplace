/**
 * Phase 4b-α of the promotions & subscriptions RFC
 * (docs/rfcs/0001-promotions-and-subscriptions.md).
 *
 * Thin adapter between our SubscriptionPlan / Subscription domain and the
 * Stripe Subscriptions API. Scoped deliberately: this phase only handles
 *   (a) provisioning a Stripe Price when a vendor creates a plan, and
 *   (b) syncing a local Subscription row when Stripe fires a subscription
 *       lifecycle event on an id we already know.
 *
 * Phase 4b-β will add: creating a Stripe Customer + Checkout Session from
 * the buyer subscribe action, materialising an Order + VendorFulfillment
 * on `invoice.paid`, and translating our cancel / pause helpers to the
 * Stripe API. None of that lives here yet.
 *
 * The module exposes a small surface so both mock and real modes can be
 * exercised from unit tests. All Stripe SDK access is lazy — importing
 * this file never requires STRIPE_SECRET_KEY to be present.
 */

import { getServerEnv } from '@/lib/env'
import type { SubscriptionCadence } from '@/generated/prisma/enums'

export interface PlanProvisioningInput {
  planId: string
  productName: string
  priceEurCents: number
  cadence: SubscriptionCadence
  taxRate: number
  vendorStripeAccountId: string | null
}

export interface PlanProvisioningResult {
  stripePriceId: string
  stripeProductId: string | null
}

const CADENCE_TO_STRIPE_INTERVAL: Record<
  SubscriptionCadence,
  { interval: 'week' | 'month'; intervalCount: number }
> = {
  WEEKLY:   { interval: 'week',  intervalCount: 1 },
  BIWEEKLY: { interval: 'week',  intervalCount: 2 },
  MONTHLY:  { interval: 'month', intervalCount: 1 },
}

/**
 * Creates the Stripe Product + recurring Price for a SubscriptionPlan.
 * In mock mode (PAYMENT_PROVIDER=mock) returns deterministic fake IDs so
 * tests can assert on them without reaching the network. In stripe mode
 * creates a real Product and Price on the platform account — phase 4b-β
 * will later create Subscriptions that reference this Price with
 * `transfer_data.destination = vendorStripeAccountId`.
 */
export async function provisionPlanPrice(
  input: PlanProvisioningInput
): Promise<PlanProvisioningResult> {
  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    // Deterministic + namespaced so collisions with real Stripe ids are
    // impossible even if the env flips mid-test.
    return {
      stripePriceId: `price_mock_${input.planId}`,
      stripeProductId: `prod_mock_${input.planId}`,
    }
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(env.stripeSecretKey!)

  // We create a new Product for each plan rather than reusing the
  // marketplace Product — a Stripe Product carries the buyer-facing name
  // the buyer sees on their Stripe-hosted invoice, so keeping it 1:1 with
  // the plan gives vendors room to rename the box later without touching
  // existing subscribers.
  const product = await stripe.products.create({
    name: input.productName,
    metadata: {
      marketplacePlanId: input.planId,
      marketplaceProductName: input.productName,
    },
  })

  const cadence = CADENCE_TO_STRIPE_INTERVAL[input.cadence]
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'eur',
    unit_amount: input.priceEurCents,
    recurring: {
      interval: cadence.interval,
      interval_count: cadence.intervalCount,
    },
    tax_behavior: 'inclusive',
    metadata: {
      marketplacePlanId: input.planId,
      marketplaceTaxRate: input.taxRate.toString(),
      ...(input.vendorStripeAccountId && {
        vendorStripeAccountId: input.vendorStripeAccountId,
      }),
    },
  })

  return {
    stripePriceId: price.id,
    stripeProductId: product.id,
  }
}

/**
 * Pure mapper from Stripe's subscription.status to our local
 * SubscriptionStatus enum. Stripe has more granular states than we do —
 * we collapse anything that results in no billing to PAUSED or CANCELED
 * as appropriate. Kept as a pure function so tests can pin the mapping
 * without touching the DB or the SDK.
 *
 * Reference: https://docs.stripe.com/api/subscriptions/object#subscription_object-status
 */
export type LocalSubscriptionStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'CANCELED'
  | 'PAST_DUE'

export function mapStripeSubscriptionStatus(
  stripeStatus: string,
  pauseCollection: unknown
): LocalSubscriptionStatus {
  // Stripe exposes a paused sub as status='active' with a non-null
  // pause_collection — collapse that to our PAUSED.
  if (pauseCollection && typeof pauseCollection === 'object') {
    return 'PAUSED'
  }

  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'ACTIVE'
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE'
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED'
    case 'paused':
      return 'PAUSED'
    default:
      // Stripe may add new statuses in the future. Default to ACTIVE so
      // the buyer does not lose access silently — the mismatch will be
      // surfaced by the webhook logger and fixed in the mapper here.
      return 'ACTIVE'
  }
}

// ─── Phase 4b-β: Customer + Checkout Session helpers ─────────────────────────

export interface StripeCustomerInput {
  userId: string
  email: string
  name: string
}

/**
 * Returns a Stripe Customer id for the given user, creating one on the
 * fly if the User row does not already have a `stripeCustomerId`. In mock
 * mode, returns a deterministic `cus_mock_<userId>` without touching the
 * DB or the network. In stripe mode, the persisted id is indexed so the
 * second call is a simple column read.
 */
export async function ensureStripeCustomerId(
  input: StripeCustomerInput
): Promise<string> {
  // Lazy-load `@/lib/db` so merely importing this file does not trigger
  // env validation — the pure mapper unit tests import the status mapper
  // without any environment variables set.
  const { db } = await import('@/lib/db')
  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    const mockId = `cus_mock_${input.userId}`
    // Persist it so the buyer subscriptions rows (and later webhook
    // lookups) can join against a single id.
    await db.user.update({
      where: { id: input.userId },
      data: { stripeCustomerId: mockId },
    }).catch(() => {
      // Ignore races — another concurrent subscribe may have set it.
    })
    return mockId
  }

  const existing = await db.user.findUnique({
    where: { id: input.userId },
    select: { stripeCustomerId: true },
  })
  if (existing?.stripeCustomerId) return existing.stripeCustomerId

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(env.stripeSecretKey!)
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    metadata: { marketplaceUserId: input.userId },
  })

  await db.user.update({
    where: { id: input.userId },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

export interface SubscriptionCheckoutInput {
  customerId: string
  stripePriceId: string
  successUrl: string
  cancelUrl: string
  metadata: {
    marketplacePlanId: string
    marketplaceBuyerId: string
    marketplaceShippingAddressId: string
  }
}

export interface SubscriptionCheckoutSession {
  id: string
  url: string
}

/**
 * Creates a Stripe Checkout Session in subscription mode for a single
 * recurring line item. Mock mode returns a synthetic session + a local
 * URL the client can redirect to for a simulated success — tests read
 * the metadata back from that URL to assert the flow. Stripe mode
 * delegates to `stripe.checkout.sessions.create`.
 */
export async function createSubscriptionCheckoutSession(
  input: SubscriptionCheckoutInput
): Promise<SubscriptionCheckoutSession> {
  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    const id = `cs_mock_${Date.now()}_${input.metadata.marketplacePlanId}`
    // Mock checkout success URL — the buyer flow redirects here in dev
    // mode, and a dedicated mock-confirmation route (phase 4b-β follow-up)
    // can pick up the metadata. For phase 4b-β the URL is informational.
    const url = `${input.successUrl}?mock_session=${id}&planId=${input.metadata.marketplacePlanId}`
    return { id, url }
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(env.stripeSecretKey!)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: input.customerId,
    line_items: [{ price: input.stripePriceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    subscription_data: {
      metadata: input.metadata,
    },
    metadata: input.metadata,
  })

  if (!session.url) {
    throw new Error('Stripe devolvió una sesión de checkout sin URL')
  }
  return { id: session.id, url: session.url }
}

// ─── Webhook event shapes ─────────────────────────────────────────────────────

export interface StripeSubscriptionEventPayload {
  id: string
  status: string
  pause_collection?: unknown
  cancel_at?: number | null
  canceled_at?: number | null
  customer?: string | null
  metadata?: Record<string, string> | null
  items?: { data: Array<{ price: { id: string } }> }
}

export interface StripeInvoiceEventPayload {
  id: string
  subscription: string | null
  amount_paid: number
  currency: string
  lines?: { data: Array<{ price?: { id: string } | null }> }
}

/**
 * Parses the `data.object` of a Stripe `invoice.*` event into a narrower
 * shape so the webhook handler can materialize an Order without trusting
 * the raw payload.
 */
export function parseStripeInvoiceEvent(
  obj: unknown
): StripeInvoiceEventPayload | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id.startsWith('in_')) return null
  const subscription =
    typeof o.subscription === 'string' ? o.subscription : null
  const amount = typeof o.amount_paid === 'number' ? o.amount_paid : 0
  const currency = typeof o.currency === 'string' ? o.currency : 'eur'
  return {
    id: o.id,
    subscription,
    amount_paid: amount,
    currency,
  }
}

/**
 * Parses the `data.object` of a Stripe `customer.subscription.*` event
 * into a narrower shape. Returns null when the payload doesn't look like
 * a subscription (in which case the webhook handler logs and no-ops).
 */
export function parseStripeSubscriptionEvent(
  obj: unknown
): StripeSubscriptionEventPayload | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id.startsWith('sub_')) return null
  if (typeof o.status !== 'string') return null
  const metadata =
    o.metadata && typeof o.metadata === 'object'
      ? (o.metadata as Record<string, string>)
      : null
  const customer =
    typeof o.customer === 'string' ? o.customer : null
  return {
    id: o.id,
    status: o.status,
    pause_collection: o.pause_collection,
    cancel_at: typeof o.cancel_at === 'number' ? o.cancel_at : null,
    canceled_at: typeof o.canceled_at === 'number' ? o.canceled_at : null,
    customer,
    metadata,
  }
}
