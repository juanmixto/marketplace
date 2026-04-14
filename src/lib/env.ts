import { z } from 'zod'

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required').optional(),
  AUTH_URL: z.string().url('AUTH_URL must be a valid URL').optional(),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  CONTACT_EMAIL: z.string().email().optional(),
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  // Phase 4a of the promotions & subscriptions RFC. When unset or 'false',
  // the buyer subscription flow is dormant: server actions refuse to
  // create new subscriptions and the "Mis suscripciones" buyer page shows
  // a disabled banner. Flip to 'true' in staging once Stripe Subscriptions
  // are wired in phase 4b.
  SUBSCRIPTIONS_BUYER_BETA: z.enum(['true', 'false']).default('false'),
})

export function parseServerEnv(env: NodeJS.ProcessEnv) {
  const parsed = baseEnvSchema.parse(env)

  if (parsed.PAYMENT_PROVIDER === 'stripe') {
    const stripeFields = [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    ] as const

    const missing = stripeFields.filter(key => !parsed[key])
    if (missing.length > 0) {
      throw new Error(
        `Stripe mode requires these env vars: ${missing.join(', ')}`
      )
    }
  }

  return {
    databaseUrl: env.NODE_ENV === 'test' && parsed.DATABASE_URL_TEST
      ? parsed.DATABASE_URL_TEST
      : parsed.DATABASE_URL,
    authSecret: parsed.AUTH_SECRET,
    authUrl: parsed.AUTH_URL,
    appUrl: parsed.NEXT_PUBLIC_APP_URL,
    paymentProvider: parsed.PAYMENT_PROVIDER,
    stripeSecretKey: parsed.STRIPE_SECRET_KEY,
    stripeWebhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    stripePublishableKey: parsed.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    contactEmail: parsed.CONTACT_EMAIL,
    subscriptionsBuyerBeta: parsed.SUBSCRIPTIONS_BUYER_BETA === 'true',
  }
}

let cachedEnv: ReturnType<typeof parseServerEnv> | undefined

export function getServerEnv() {
  cachedEnv ??= parseServerEnv(process.env)
  return cachedEnv
}

export function resetServerEnvCache() {
  cachedEnv = undefined
}
