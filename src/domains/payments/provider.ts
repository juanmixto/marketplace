/**
 * Payment provider abstraction.
 * Supports 'mock' (dev) and 'stripe' (production).
 * Switch via PAYMENT_PROVIDER env var.
 */
import crypto from 'crypto'
import { getServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'

export interface PaymentIntent {
  id: string
  clientSecret: string
  amount: number
}

/**
 * Optional Stripe Connect destination data for single-vendor orders.
 *
 * When provided AND the active provider is `stripe`, the Payment Intent is
 * created with `transfer_data.destination = vendorAccountId` and an
 * `application_fee_amount` equal to the platform commission. Stripe routes
 * the funds directly to the vendor's Express account on capture, minus the
 * fee, with no extra transfer call required.
 *
 * Multi-vendor orders intentionally do NOT pass this — they keep funds on
 * the platform account and rely on the existing settlement system to pay
 * each vendor periodically. (Stripe's destination charges only support a
 * single recipient per Payment Intent.)
 */
export interface ConnectDestination {
  vendorAccountId: string
  applicationFeeAmountCents: number
}

declare global {
  var __testCreatePaymentIntentOverride:
    | ((amountCents: number) => Promise<PaymentIntent>)
    | undefined
}

export function setTestCreatePaymentIntentOverride(
  fn: ((amountCents: number) => Promise<PaymentIntent>) | undefined,
): void {
  globalThis.__testCreatePaymentIntentOverride = fn
}

export async function createPaymentIntent(
  amountCents: number,
  metadata: Record<string, string>,
  options?: { connect?: ConnectDestination }
): Promise<PaymentIntent> {
  // Test-only injection point so integration tests can drive the
  // provider-failure path without monkey-patching ES module exports
  // or hitting the real Stripe SDK. Mirrors the test-session pattern
  // in src/lib/action-session.ts. Production NODE_ENV ('production' /
  // 'development') ignores the override even if it leaks.
  if (process.env.NODE_ENV === 'test' && globalThis.__testCreatePaymentIntentOverride) {
    return globalThis.__testCreatePaymentIntentOverride(amountCents)
  }

  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    const id = `mock_pi_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    return { id, clientSecret: `${id}_secret`, amount: amountCents }
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(env.stripeSecretKey!)

  // Idempotency key derived from our own order id so a retry (whether
  // from the internal loop below, a request-level retry, or a network
  // blip that cost us the first response) re-uses the same PaymentIntent
  // instead of creating a duplicate. Stripe treats the key as unique per
  // secret key for 24h — wider than any user-driven retry window we care
  // about. Without this, attempt #1 timing out AFTER Stripe committed
  // server-side would make attempt #2 open a second PI with the same
  // orderId metadata: two live PIs, either could capture, two charges
  // for one cart.
  //
  // Fallback to correlationId when orderId is absent (defensive; today's
  // caller always sets it).
  const idempotencyKey = metadata.orderId ?? metadata.correlationId ?? undefined

  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: 'eur',
          metadata,
          automatic_payment_methods: { enabled: true },
          ...(options?.connect && {
            application_fee_amount: options.connect.applicationFeeAmountCents,
            transfer_data: { destination: options.connect.vendorAccountId },
          }),
        },
        idempotencyKey ? { idempotencyKey } : undefined
      )

      return {
        id: intent.id,
        clientSecret: intent.client_secret!,
        amount: intent.amount,
      }
    } catch (error) {
      lastError = error
      logger.error('checkout.stripe_intent_create_failed', {
        amountCents,
        attempt,
        connectDestination: options?.connect?.vendorAccountId ?? null,
        orderId: metadata.orderId ?? null,
        correlationId: metadata.correlationId ?? null,
        idempotencyKey: idempotencyKey ?? null,
        error,
      })
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No se pudo iniciar el pago con Stripe')
}

export async function confirmMockPayment(paymentIntentId: string): Promise<void> {
  // In mock mode, payment is always successful. No external call needed.
  if (!paymentIntentId.startsWith('mock_')) {
    throw new Error('confirmMockPayment called with non-mock intent')
  }
}

/**
 * Options that callers must supply when refunding.
 *
 * - `fundedBy` ('PLATFORM' | 'VENDOR'): drives whether the application
 *   fee is also refunded. PLATFORM-funded refunds return the platform's
 *   commission to the buyer too; VENDOR-funded refunds leave the fee
 *   on the platform balance (the vendor pays the fee on the refund as
 *   well, standard policy).
 * - `idempotencyKey`: forwarded to Stripe via the `Idempotency-Key`
 *   header so a retry of a network-failed refund returns the same
 *   `re_*` instead of issuing a second one. Caller is responsible for
 *   keying it stably (e.g. `refund_${incidentId}`).
 * - `metadata`: passed through to Stripe (kept as a map for grep-friendly
 *   audit trails on the dashboard).
 */
export interface RefundPaymentIntentOptions {
  fundedBy?: 'PLATFORM' | 'VENDOR'
  idempotencyKey?: string
  metadata?: Record<string, string>
}

declare global {
  var __testRefundPaymentIntentOverride:
    | ((
      providerRef: string,
      amountCents: number,
      options: RefundPaymentIntentOptions,
    ) => Promise<{ id: string }>)
    | undefined
}

export function setTestRefundPaymentIntentOverride(
  fn:
    | ((
      providerRef: string,
      amountCents: number,
      options: RefundPaymentIntentOptions,
    ) => Promise<{ id: string }>)
    | undefined,
): void {
  globalThis.__testRefundPaymentIntentOverride = fn
}

/**
 * Issues a refund against a previously-confirmed Payment Intent.
 * Returns the provider's refund id so the caller can persist it on
 * the local `Refund` row.
 *
 * Mock mode: produces a synthetic id, no external call — mirrors the
 * createPaymentIntent mock contract so admin flows work end-to-end in
 * dev + integration tests.
 *
 * Stripe mode (#1148 H-1): for destination charges (created with
 * `transfer_data.destination`) the default Stripe behavior is to refund
 * the buyer from the platform balance only, leaving the vendor holding
 * the funds. We always pass `reverse_transfer: true` so Stripe pulls
 * the money back from the connected account; the
 * `refund_application_fee` flag is then derived from `fundedBy`. For
 * non-Connect (multi-vendor) payments these flags are no-ops, so it's
 * safe to send them unconditionally.
 *
 * Stripe mode (#1153 H-3): the request always carries an
 * `Idempotency-Key` header when the caller supplies one (we always do,
 * keyed by incident id), so a retry after a network blip collapses to
 * the same `re_*` instead of issuing a second refund.
 *
 * The caller is responsible for rolling back the local Incident /
 * Refund rows if this throws.
 */
export async function refundPaymentIntent(
  providerRef: string,
  amountCents: number,
  options: RefundPaymentIntentOptions = {},
): Promise<{ id: string }> {
  if (process.env.NODE_ENV === 'test' && globalThis.__testRefundPaymentIntentOverride) {
    return globalThis.__testRefundPaymentIntentOverride(providerRef, amountCents, options)
  }

  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    const id = `mock_re_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    return { id }
  }

  if (!providerRef || providerRef.startsWith('mock_')) {
    // Safety net: production mode should never receive a mock
    // providerRef. If it does, the Incident payload is corrupt —
    // throw loudly so the admin sees an error rather than silently
    // creating a fake refund row.
    throw new Error(
      `refundPaymentIntent: refusing to call Stripe with mock-style providerRef=${providerRef}`,
    )
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(env.stripeSecretKey!)
  const refund = await stripe.refunds.create(
    {
      payment_intent: providerRef,
      amount: amountCents,
      metadata: options.metadata,
      reverse_transfer: true,
      refund_application_fee: options.fundedBy === 'PLATFORM',
    },
    options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
  )
  return { id: refund.id }
}
