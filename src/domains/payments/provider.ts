/**
 * Payment provider abstraction.
 * Supports 'mock' (dev) and 'stripe' (production).
 * Switch via PAYMENT_PROVIDER env var.
 */
import { getServerEnv } from '@/lib/env'

export interface PaymentIntent {
  id: string
  clientSecret: string
  amount: number
}

export async function createPaymentIntent(
  amountCents: number,
  metadata: Record<string, string>
): Promise<PaymentIntent> {
  const env = getServerEnv()

  if (env.paymentProvider === 'mock') {
    const id = `mock_pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
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
      })

      return {
        id: intent.id,
        clientSecret: intent.client_secret!,
        amount: intent.amount,
      }
    } catch (error) {
      lastError = error
      console.error('[checkout] stripe payment intent creation failed', {
        amountCents,
        attempt,
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
