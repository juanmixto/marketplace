import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pin the set of structured-log event names that observability tooling,
 * dashboards, and runbooks grep for. Removing or renaming any of these
 * invalidates alerting / log queries without warning — this suite
 * catches that early.
 *
 * When adding a new event name, add it here AND update
 * docs/runbooks/payment-incidents.md so oncall can find it.
 */

interface EventAssertion {
  files: string[]
  events: string[]
}

const REQUIRED_CHECKOUT_EVENTS: EventAssertion = {
  files: [
    'src/domains/orders/use-cases/create-order.ts',
    'src/domains/orders/use-cases/create-checkout-order.ts',
    'src/domains/orders/use-cases/confirm-order.ts',
  ],
  events: [
    'checkout.start',
    'checkout.committed',
    'checkout.address_fallback',
    'checkout.address_save_failed',
    'checkout.payment_mark_failed',
    'checkout.payment_intent_failed',
    'checkout.payment_row_diverged',
    'checkout.payment_row_missing',
    'checkout.payment_row_idempotent_match',
    'checkout.mock_confirmation_failed',
    'checkout.tx_failed',
    'checkout.confirm_amount_mismatch',
  ],
}

const REQUIRED_STRIPE_WEBHOOK_EVENTS: EventAssertion = {
  files: ['src/app/api/webhooks/stripe/route.ts'],
  events: [
    'stripe.webhook.received',
    'stripe.webhook.duplicate',
    'stripe.webhook.invalid_payload',
    'stripe.webhook.delivery_insert_failed',
    'stripe.webhook.delivery_update_failed',
    'stripe.webhook.processing_failed',
    'stripe.webhook.payment_mismatch',
    'stripe.webhook.subscription_created_missing_metadata',
    'stripe.webhook.subscription_created_plan_missing',
    'stripe.webhook.subscription_created_address_missing',
    'stripe.webhook.subscription_not_found',
    'stripe.webhook.subscription_sync_stale',
    'stripe.webhook.invoice_paid_subscription_not_found',
    'stripe.webhook.invoice_paid_stale',
    'stripe.webhook.invoice_payment_failed_stale',
    'stripe.webhook.dead_letter_record_failed',
  ],
}

const REQUIRED_WEBHOOK_RETRY_EVENTS: EventAssertion = {
  files: ['src/domains/payments/webhook.ts'],
  events: ['stripe.webhook.retry', 'stripe.webhook.retry_exhausted'],
}

const REQUIRED_PAYMENT_PROVIDER_EVENTS: EventAssertion = {
  files: ['src/domains/payments/provider.ts'],
  events: ['checkout.stripe_intent_create_failed'],
}

// #1218: pin the `auth.*` taxonomy. These names back the credential-
// stuffing alert ("auth.signin.failed > 30/min"), the OAuth callback
// alert ("auth.oauth.callback_error rate > 10%/5min"), and the support
// playbook for "I can't log in" tickets. Renaming any of them silently
// breaks the alert.
//
// NOTE: there is intentionally no `order.*` taxonomy. The order
// lifecycle is captured under `checkout.*` (above) and
// `stripe.webhook.*` (already pinned) by convention — order events
// without a checkout/webhook origin would be UI events, which belong
// in the PostHog analytics taxonomy, not the structured logs.
const REQUIRED_AUTH_EVENTS: EventAssertion = {
  files: [
    'src/lib/auth.ts',
    'src/components/auth/SocialButtonsClient.tsx',
    'src/app/api/auth/register/route.ts',
    'src/app/api/auth/forgot-password/route.ts',
    'src/app/api/auth/reset-password/route.ts',
    'src/app/api/auth/login-precheck/route.ts',
    'src/app/(auth)/login/page.tsx',
    'src/app/(auth)/login/link/actions.ts',
    'src/app/(auth)/login/link/page.tsx',
    'src/app/(auth)/onboarding/actions.ts',
  ],
  events: [
    // Sign-in callback policy decisions and OAuth error paths.
    'auth.callback.rejected',
    'auth.social.allow',
    'auth.social.deny',
    'auth.social.error',
    'auth.social.no_email',
    'auth.social.success',
    'auth.social.missing_secret',
    // Registration / recovery.
    'auth.register.failed',
    'auth.forgot_password.failed',
    'auth.reset_password.failed',
    'auth.login_precheck.failed',
    // Account link flow (multi-provider).
    'auth.link.completed',
    'auth.link.required',
    'auth.link.token_expired',
    'auth.link.token_invalid',
    'auth.link.password_failed',
    'auth.link.missing_secret',
    'auth.link.page_invalid_token',
    'auth.link.page_missing_secret',
    'auth.account.linked',
    'auth.account_linked_email.sent',
    'auth.account_linked_email.failed',
    // OAuth user provisioning.
    'auth.user.created_via_oauth',
    // Onboarding gate (post-OAuth).
    'auth.onboarding.completed',
    'auth.onboarding.update_failed',
    // Catch-all for unknown error codes surfaced from NextAuth.
    'auth.error.unknown_code',
  ],
}

const REQUIRED_INFRA_EVENTS: EventAssertion = {
  files: ['src/app/api/healthcheck/route.ts', 'src/lib/queue.ts'],
  events: [
    // Liveness probe failure (LB pivots, oncall investigates).
    'healthcheck.probe_failed',
    // Queue lifecycle — diagnoses "jobs aren't running" without DB sleuthing.
    'queue.started',
    'queue.stopped',
    'queue.enqueued',
    'queue.handler_registered',
    'queue.pgboss_error',
  ],
}

for (const { files, events } of [
  REQUIRED_CHECKOUT_EVENTS,
  REQUIRED_STRIPE_WEBHOOK_EVENTS,
  REQUIRED_WEBHOOK_RETRY_EVENTS,
  REQUIRED_PAYMENT_PROVIDER_EVENTS,
  REQUIRED_AUTH_EVENTS,
  REQUIRED_INFRA_EVENTS,
]) {
  test(`${files.join(', ')}: all required event names still present`, () => {
    const content = files
      .map((file) => readFileSync(join(process.cwd(), file), 'utf-8'))
      .join('\n')
    const missing: string[] = []
    for (const event of events) {
      if (!content.includes(`'${event}'`)) missing.push(event)
    }
    assert.equal(
      missing.length,
      0,
      `Missing event names in ${files.join(', ')}: ${missing.join(', ')}. If you renamed them, update docs/runbooks/payment-incidents.md and this test.`
    )
  })
}

test('ratelimit logEvent input names are pinned (resulting scopes are computed)', () => {
  // src/lib/ratelimit.ts builds the structured-log scope dynamically
  // via `ratelimit.${event.replace(/:/g, '.')}`, so the literal scope
  // string never appears in the source. Pin the INPUT event names
  // instead — those are what end up at the alerting layer (after the
  // `:`-to-`.` transform). Renaming or removing one silently breaks
  // the rate-limit dashboard or, worse, the `degraded:fail-closed`
  // P0 alert that fires when Upstash collapses checkout.
  const content = readFileSync(join(process.cwd(), 'src/lib/ratelimit.ts'), 'utf-8')
  const required = [
    'degraded:fail-closed',
    'degraded:fallback-memory',
    'upstash:error',
    'upstash:malformed',
    'untrusted-header-ignored',
  ]
  const missing = required.filter((e) => !content.includes(`'${e}'`))
  assert.equal(
    missing.length,
    0,
    `Missing ratelimit logEvent input names: ${missing.join(', ')}. Renaming requires updating the rate-limit alert in Sentry/PostHog.`,
  )
})

test('orders use-cases no longer use console.* for logging', () => {
  const files = [
    'src/domains/orders/use-cases/create-order.ts',
    'src/domains/orders/use-cases/create-checkout-order.ts',
    'src/domains/orders/use-cases/confirm-order.ts',
  ]
  for (const file of files) {
    const content = readFileSync(join(process.cwd(), file), 'utf-8')
    assert.ok(
      !/console\.(warn|error|info|debug|log)\s*\(/.test(content),
      `${file} must use logger.* for all structured logging`,
    )
  }
})

test('stripe webhook route no longer uses console.* for logging', () => {
  const content = readFileSync(
    join(process.cwd(), 'src/app/api/webhooks/stripe/route.ts'),
    'utf-8'
  )
  assert.ok(
    !/console\.(warn|error|info|debug|log)\s*\(/.test(content),
    'stripe webhook route must use logger.* for all structured logging'
  )
})

test('webhook retry + payment provider no longer use console.* for logging', () => {
  for (const file of ['src/domains/payments/webhook.ts', 'src/domains/payments/provider.ts']) {
    const content = readFileSync(join(process.cwd(), file), 'utf-8')
    assert.ok(
      !/console\.(warn|error|info|debug|log)\s*\(/.test(content),
      `${file} must use logger.* for all structured logging`,
    )
  }
})

test('correlation ID is threaded through checkout logs', () => {
  const content = [
    'src/domains/orders/use-cases/create-order.ts',
    'src/domains/orders/use-cases/create-checkout-order.ts',
    'src/domains/orders/use-cases/confirm-order.ts',
  ]
    .map((file) => readFileSync(join(process.cwd(), file), 'utf-8'))
    .join('\n')
  // The start event must always include correlationId; easiest pin is
  // to require that the word "correlationId" appears at least as many
  // times as the number of logger.* calls. This catches regressions
  // where someone adds a log without threading the id.
  const loggerCalls = (content.match(/logger\.(info|warn|error|debug)\(/g) ?? []).length
  const correlationRefs = (content.match(/correlationId/g) ?? []).length
  assert.ok(
    correlationRefs >= loggerCalls,
    `Expected every logger call to reference correlationId. Found ${loggerCalls} logger calls and ${correlationRefs} correlationId references.`
  )
})
