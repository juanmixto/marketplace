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
  // Email — Resend
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('no-reply@example.com'),
  // Rate limiting — Upstash Redis. Presence of REST_URL flips ratelimit
  // from the in-memory store to Upstash; TOKEN is then required.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Shipping — Sendcloud. The three credential fields are required as
  // a bundle: presence of any one without the others throws at boot.
  SENDCLOUD_BASE_URL: z.string().url().default('https://panel.sendcloud.sc/api/v2'),
  SENDCLOUD_PUBLIC_KEY: z.string().min(1).optional(),
  SENDCLOUD_SECRET_KEY: z.string().min(1).optional(),
  SENDCLOUD_WEBHOOK_SECRET: z.string().min(1).optional(),
  SENDCLOUD_SENDER_ID: z.coerce.number().int().positive().optional(),
})

export function parseServerEnv(env: NodeJS.ProcessEnv) {
  const parsed = baseEnvSchema.parse(env)

  // Production-only safety assertions. These turn silent misconfigurations
  // into loud boot failures. See security audit issues #538, #542, #548.
  if (env.NODE_ENV === 'production') {
    // #548: refuse to boot in prod with the mock payment provider. The
    // Stripe webhook handler accepts unsigned events when provider=mock,
    // so leaving the default in prod is a free-money bug.
    if (parsed.PAYMENT_PROVIDER !== 'stripe') {
      throw new Error(
        'PAYMENT_PROVIDER must be "stripe" in production (was "mock")'
      )
    }

    // #538: require an explicit trust decision for x-forwarded-for. When
    // neither flag is set, getClientIP() buckets every request under the
    // "untrusted-client" sentinel, which turns per-IP rate limits into a
    // global lockout. Vercel is always trusted; on self-hosted (Traefik),
    // operators must set TRUST_PROXY_HEADERS=true after verifying the
    // proxy strips client-supplied forwarding headers.
    const onVercel = env.VERCEL === '1' || env.VERCEL === 'true'
    if (!onVercel && env.TRUST_PROXY_HEADERS !== 'true') {
      throw new Error(
        'TRUST_PROXY_HEADERS=true is required in production (or deploy on Vercel). ' +
        'Without it, rate limiting collapses to a single global bucket.'
      )
    }

    // #542: require AUTH_URL in production so NextAuth constructs
    // verification / reset links from a pinned origin rather than the
    // inbound Host header.
    if (!parsed.AUTH_URL) {
      throw new Error('AUTH_URL is required in production')
    }
  }

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

  if (parsed.UPSTASH_REDIS_REST_URL && !parsed.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL is set but UPSTASH_REDIS_REST_TOKEN is missing'
    )
  }

  const sendcloudCredFields = [
    'SENDCLOUD_PUBLIC_KEY',
    'SENDCLOUD_SECRET_KEY',
    'SENDCLOUD_WEBHOOK_SECRET',
  ] as const
  const sendcloudPresent = sendcloudCredFields.filter(key => Boolean(parsed[key]))
  if (sendcloudPresent.length > 0 && sendcloudPresent.length < sendcloudCredFields.length) {
    const missing = sendcloudCredFields.filter(key => !parsed[key])
    throw new Error(
      `Sendcloud requires all of ${sendcloudCredFields.join(', ')}; missing: ${missing.join(', ')}`
    )
  }

  const sendcloudConfigured =
    sendcloudPresent.length === sendcloudCredFields.length

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
    resendApiKey: parsed.RESEND_API_KEY,
    emailFrom: parsed.EMAIL_FROM,
    upstashRedisRestUrl: parsed.UPSTASH_REDIS_REST_URL,
    upstashRedisRestToken: parsed.UPSTASH_REDIS_REST_TOKEN,
    sendcloudBaseUrl: parsed.SENDCLOUD_BASE_URL,
    sendcloudPublicKey: parsed.SENDCLOUD_PUBLIC_KEY,
    sendcloudSecretKey: parsed.SENDCLOUD_SECRET_KEY,
    sendcloudWebhookSecret: parsed.SENDCLOUD_WEBHOOK_SECRET,
    sendcloudSenderId: parsed.SENDCLOUD_SENDER_ID ?? null,
    sendcloudConfigured,
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
