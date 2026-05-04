import { z } from 'zod'
import { validateAuthDeploymentContract } from '@/lib/auth-env'

// Placeholder DATABASE_URL used only when no value is provided at parse
// time. Next.js `next build` on Vercel preview (and similar CI contexts)
// loads modules that transitively import `getServerEnv()` — notably
// `src/app/robots.ts` and other metadata routes — before the deploy
// environment injects real vars. Parsing must not throw in that window,
// or the entire build crashes. The `postgresql://invalid-placeholder...`
// string fails loudly with a connection error on first use, so misuse
// at runtime is still caught. The production-runtime gate below
// enforces the real check once the server is actually serving traffic.
const DATABASE_URL_BUILD_PLACEHOLDER =
  'postgresql://invalid-placeholder-build-only:invalid@localhost:5432/none'

// Coerce common boolean string forms ("true" / "false" / "1" / "0") into
// a Zod boolean. Treats undefined as undefined so callers can keep
// `.optional()` semantics.
const booleanString = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform(v => v === 'true' || v === '1')

const baseEnvSchema = z.object({
  // ─── Core ──────────────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1)
    .default(DATABASE_URL_BUILD_PLACEHOLDER),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required').optional(),
  AUTH_URL: z.string().url('AUTH_URL must be a valid URL').optional(),
  // Google OAuth — provider is only registered when BOTH vars are set.
  // Refined as a pair below so partial misconfig fails loudly at boot.
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
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
  //
  // DEPRECATED: new feature gates should use src/lib/flags.ts
  // (isFeatureEnabled / useFeatureFlag) instead of a process.env var.
  // This one is kept until the subscriptions migration PR moves the
  // gate to `feat-buyer-subscriptions` in PostHog.
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
  // PostHog — client key is read directly via process.env.NEXT_PUBLIC_*
  // in src/lib/posthog.ts. The server-side flag evaluator lives in
  // src/lib/flags.ts and needs two additional secrets:
  //   - POSTHOG_PERSONAL_API_KEY enables in-process local evaluation
  //     (no HTTP round-trip per isFeatureEnabled call). Without it the
  //     SDK still works but adds ~50ms to every guarded server action.
  //   - FEATURE_FLAGS_OVERRIDE takes precedence over PostHog. Intended
  //     for tests and for the "PostHog itself is down during an
  //     incident" case. Value is a JSON object: {"kill-checkout":false}.
  //     REJECTED in APP_ENV=production (see refine below) so an override
  //     can never silently invalidate kill switches in prod.
  POSTHOG_PERSONAL_API_KEY: z.string().min(1).optional(),
  FEATURE_FLAGS_OVERRIDE: z.string().optional(),
  // Domain migration scaffolding (Fase 4 / PR 1 of docs/runbooks/domain-migration.md).
  // Defaults preserve pre-migration behaviour; staging/production override via env.
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  // Browser-visible mirror of APP_ENV so client code (Sentry init, PostHog
  // capture) can tag events with the deploy environment without going
  // through getServerEnv(). Webpack inlines NEXT_PUBLIC_* at build time;
  // operators must set both APP_ENV (server) and NEXT_PUBLIC_APP_ENV
  // (browser) to the same value in staging/production deploys.
  NEXT_PUBLIC_APP_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  SUPPORT_EMAIL: z.string().email().default('soporte@feldescloud.com'),
  DEV_TUNNEL_HOSTS: z.string().default('*.raizdirecta.es,*.feldescloud.com'),

  // ─── Telegram bot (vendor notifications) ────────────────────────────────
  // All-or-none refined below: presence of any one of the 3 without the
  // others throws at boot.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),

  // ─── Telegram ingestion sidecar (Telethon) ──────────────────────────────
  TELEGRAM_SIDECAR_URL: z.string().url().optional(),
  TELEGRAM_SIDECAR_TOKEN: z.string().min(1).optional(),
  TELEGRAM_SIDECAR_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // ─── Web Push (VAPID) ───────────────────────────────────────────────────
  // Pair refined below.
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),

  // ─── Photo storage (Vercel Blob) ────────────────────────────────────────
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  PHOTO_SWEEP_DRY_RUN: booleanString.optional(),

  // ─── Image prewarm queue ────────────────────────────────────────────────
  IMAGE_PREWARM_ENABLED: booleanString.optional(),
  IMAGE_PREWARM_BASE_URL: z.string().url().optional(),

  // ─── Cron endpoints ─────────────────────────────────────────────────────
  // Required in APP_ENV=production (refine below); without it the cron
  // route is callable by anyone who knows the URL.
  CRON_SECRET: z.string().min(1).optional(),

  // ─── Telegram ingestion processing ──────────────────────────────────────
  INGESTION_TELEGRAM_PROVIDER: z.enum(['telethon', 'mock']).optional(),
  INGESTION_PROCESSING_CONCURRENCY: z.coerce.number().int().positive().optional(),
  INGESTION_LLM_MODEL: z.string().min(1).optional(),
  INGESTION_LLM_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  OLLAMA_URL: z.string().url().optional(),

  // ─── Sentry ─────────────────────────────────────────────────────────────
  // Both DSNs are semi-public by design (the SDK accepts events from any
  // origin), but we still validate the URL shape to catch typos.
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  SENTRY_REPLAYS_SESSION_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  SENTRY_REPLAYS_ONERROR_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

  // ─── Trust proxy (already runtime-checked below; declared for inventory)
  TRUST_PROXY_HEADERS: booleanString.optional(),

  // ─── Local dev convenience flags ────────────────────────────────────────
  // Both REJECTED in APP_ENV=production (refine below).
  DISABLE_LOGIN_RATELIMIT: z.string().optional(),
  MOCK_OAUTH_ENABLED: z.string().optional(),
  NEXT_PUBLIC_SHOW_DEMO_CREDS: z.string().optional(),

  // ─── Logger ─────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
})

export function parseServerEnv(env: NodeJS.ProcessEnv) {
  const parsed = baseEnvSchema.parse(env)

  // ─── APP_ENV=production environment-level checks ─────────────────────────
  // These fire whenever APP_ENV=production is declared, regardless of
  // NEXT_PHASE — workers, tsx scripts and standalone `node` entrypoints
  // never set NEXT_PHASE='phase-production-server', so the previous
  // gate let mock+prod through (#1181, free-money bug). Configuration
  // intent is enough; we don't need to wait for HTTP traffic.
  const isProductionEnv = parsed.APP_ENV === 'production'

  if (isProductionEnv) {
    // P0-4 (#1181): refuse mock provider in prod APP_ENV. The Stripe
    // webhook handler accepts unsigned events when provider=mock, so
    // mock+prod is a free-money bug regardless of which entrypoint
    // boots the process.
    if (parsed.PAYMENT_PROVIDER !== 'stripe') {
      throw new Error(
        'PAYMENT_PROVIDER must be "stripe" in APP_ENV=production (was "' +
          parsed.PAYMENT_PROVIDER +
          '"). Mock provider bypasses webhook signature verification.',
      )
    }

    // P0-4 reinforcement: when APP_ENV=production the Stripe key MUST be
    // a live key. Catches the "deployed prod with test keys by accident"
    // shape — test keys can't actually charge cards but they let the
    // webhook handler accept events in modes that staging doesn't see.
    if (
      parsed.STRIPE_SECRET_KEY &&
      !parsed.STRIPE_SECRET_KEY.startsWith('sk_live_')
    ) {
      throw new Error(
        'APP_ENV=production requires STRIPE_SECRET_KEY to start with "sk_live_". ' +
          'Got a non-live key — this is almost certainly an env-file mistake.',
      )
    }
    if (
      parsed.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      !parsed.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')
    ) {
      throw new Error(
        'APP_ENV=production requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to start with "pk_live_".',
      )
    }

    // P0-5 (#1182): FEATURE_FLAGS_OVERRIDE invalidates kill switches.
    // It is intended for tests and for the "PostHog itself is down
    // during an incident" recovery — never for prod operation.
    if (parsed.FEATURE_FLAGS_OVERRIDE) {
      throw new Error(
        'FEATURE_FLAGS_OVERRIDE is forbidden in APP_ENV=production. ' +
          'It would silently invalidate kill switches like kill-checkout, kill-auth-social.',
      )
    }
    if (env.NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE) {
      throw new Error(
        'NEXT_PUBLIC_FEATURE_FLAGS_OVERRIDE is forbidden in APP_ENV=production. ' +
          'It is webpack-inlined at build time and cannot be rotated without a redeploy.',
      )
    }

    // Local-only convenience flags must never leak to prod.
    if (parsed.DISABLE_LOGIN_RATELIMIT === '1') {
      throw new Error('DISABLE_LOGIN_RATELIMIT=1 is forbidden in APP_ENV=production.')
    }
    if (parsed.MOCK_OAUTH_ENABLED === 'true' || parsed.MOCK_OAUTH_ENABLED === '1') {
      throw new Error('MOCK_OAUTH_ENABLED is forbidden in APP_ENV=production.')
    }
    if (
      parsed.NEXT_PUBLIC_SHOW_DEMO_CREDS === 'true' ||
      parsed.NEXT_PUBLIC_SHOW_DEMO_CREDS === '1'
    ) {
      throw new Error('NEXT_PUBLIC_SHOW_DEMO_CREDS is forbidden in APP_ENV=production.')
    }

    // CRON_SECRET required so cron endpoints aren't world-callable.
    if (!parsed.CRON_SECRET) {
      throw new Error(
        'CRON_SECRET is required in APP_ENV=production. ' +
          'Without it /api/cron/* is callable by anyone who guesses the URL.',
      )
    }
  }

  // Production-runtime-only safety assertions. See audit issues #538,
  // #542, #548.
  //
  // Gated on NEXT_PHASE === 'phase-production-server' (set by Next only
  // when actually serving HTTP traffic) so `next build` and standalone
  // scripts like `prisma db seed` — which run with NODE_ENV=production
  // in CI and deploy pipelines — don't trip the checks. The assertions
  // are about what the running app accepts from the network, not about
  // build-time or CLI contexts.
  const isProductionRuntime =
    env.NODE_ENV === 'production' && env.NEXT_PHASE === 'phase-production-server'
  if (isProductionRuntime) {
    // Real DATABASE_URL is required at runtime in production. The
    // placeholder default exists only to let `next build` parse this
    // schema before the deploy environment injects the real value.
    if (parsed.DATABASE_URL === DATABASE_URL_BUILD_PLACEHOLDER) {
      throw new Error('DATABASE_URL is required at runtime')
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

    // #591: validate the full auth deployment contract (AUTH_URL must
    // be HTTPS; AUTH_URL / NEXT_PUBLIC_APP_URL must share an origin;
    // AUTH_SECRET must be set). A split-brain between these vars is
    // how session cookies silently end up scoped to a host the app
    // never redirects to — auth breaks for everyone, loudly here is
    // much better than silently later.
    const authErrors = validateAuthDeploymentContract(env)
    if (authErrors.length > 0) {
      throw new Error(
        'Auth deployment contract invalid (see docs/auth-proxy-contract.md):\n' +
          authErrors.map(e => `  - ${e}`).join('\n'),
      )
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

  // Google OAuth pair: if either is set, both must be.
  const googleFields = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'] as const
  const googlePresent = googleFields.filter(k => Boolean(parsed[k]))
  if (googlePresent.length > 0 && googlePresent.length < googleFields.length) {
    const missing = googleFields.filter(k => !parsed[k])
    throw new Error(
      `Google OAuth requires both ${googleFields.join(' and ')}; missing: ${missing.join(', ')}`,
    )
  }

  // Telegram bot trio: all-or-none. Without all three the webhook + bot
  // surface partially boots and fails late on the first interactive use.
  const telegramBotFields = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_WEBHOOK_SECRET',
    'TELEGRAM_BOT_USERNAME',
  ] as const
  const telegramBotPresent = telegramBotFields.filter(k => Boolean(parsed[k]))
  if (
    telegramBotPresent.length > 0 &&
    telegramBotPresent.length < telegramBotFields.length
  ) {
    const missing = telegramBotFields.filter(k => !parsed[k])
    throw new Error(
      `Telegram bot requires all of ${telegramBotFields.join(', ')}; missing: ${missing.join(', ')}`,
    )
  }

  // Telegram sidecar: URL + TOKEN come together. TIMEOUT_MS is optional.
  const sidecarFields = ['TELEGRAM_SIDECAR_URL', 'TELEGRAM_SIDECAR_TOKEN'] as const
  const sidecarPresent = sidecarFields.filter(k => Boolean(parsed[k]))
  if (sidecarPresent.length > 0 && sidecarPresent.length < sidecarFields.length) {
    const missing = sidecarFields.filter(k => !parsed[k])
    throw new Error(
      `Telegram sidecar requires both ${sidecarFields.join(' and ')}; missing: ${missing.join(', ')}`,
    )
  }

  // VAPID pair: required together when push is enabled. The public key
  // is webpack-inlined; the private key is server-side only.
  const vapidFields = ['VAPID_PRIVATE_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'] as const
  const vapidPresent = vapidFields.filter(k => Boolean(parsed[k]))
  if (vapidPresent.length > 0 && vapidPresent.length < vapidFields.length) {
    const missing = vapidFields.filter(k => !parsed[k])
    throw new Error(
      `VAPID push requires both ${vapidFields.join(' and ')}; missing: ${missing.join(', ')}`,
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
    posthogPersonalApiKey: parsed.POSTHOG_PERSONAL_API_KEY,
    featureFlagsOverrideRaw: parsed.FEATURE_FLAGS_OVERRIDE,
    appEnv: parsed.APP_ENV,
    supportEmail: parsed.SUPPORT_EMAIL,
    devTunnelHosts: parsed.DEV_TUNNEL_HOSTS.split(',').map(s => s.trim()).filter(Boolean),
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
