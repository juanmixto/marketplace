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
}

export async function confirmMockPayment(paymentIntentId: string): Promise<void> {
  // In mock mode, payment is always successful. No external call needed.
  if (!paymentIntentId.startsWith('mock_')) {
    throw new Error('confirmMockPayment called with non-mock intent')
  }
}
