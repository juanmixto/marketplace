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

  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'eur',
        metadata,
        automatic_payment_methods: { enabled: true },
        ...(options?.connect && {
          application_fee_amount: options.connect.applicationFeeAmountCents,
          transfer_data: { destination: options.connect.vendorAccountId },
        }),
      })

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
