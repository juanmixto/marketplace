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
  file: string
  events: string[]
}

const REQUIRED_CHECKOUT_EVENTS: EventAssertion = {
  file: 'src/domains/orders/actions.ts',
  events: [
    'checkout.start',
    'checkout.committed',
    'checkout.address_fallback',
    'checkout.address_save_failed',
    'checkout.snapshot_column_missing',
    'checkout.payment_mark_failed',
    'checkout.payment_intent_failed',
    'checkout.payment_row_mismatch',
    'checkout.mock_confirmation_failed',
    'checkout.tx_failed',
    'checkout.confirm_amount_mismatch',
  ],
}

const REQUIRED_STRIPE_WEBHOOK_EVENTS: EventAssertion = {
  file: 'src/app/api/webhooks/stripe/route.ts',
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

for (const { file, events } of [REQUIRED_CHECKOUT_EVENTS, REQUIRED_STRIPE_WEBHOOK_EVENTS]) {
  test(`${file}: all required event names still present`, () => {
    const content = readFileSync(join(process.cwd(), file), 'utf-8')
    const missing: string[] = []
    for (const event of events) {
      if (!content.includes(`'${event}'`)) missing.push(event)
    }
    assert.equal(
      missing.length,
      0,
      `Missing event names in ${file}: ${missing.join(', ')}. If you renamed them, update docs/runbooks/payment-incidents.md and this test.`
    )
  })
}

test('orders/actions.ts no longer uses console.* for logging', () => {
  const content = readFileSync(
    join(process.cwd(), 'src/domains/orders/actions.ts'),
    'utf-8'
  )
  assert.ok(
    !/console\.(warn|error|info|debug|log)\s*\(/.test(content),
    'orders/actions.ts must use logger.* for all structured logging'
  )
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

test('correlation ID is threaded through checkout logs', () => {
  const content = readFileSync(
    join(process.cwd(), 'src/domains/orders/actions.ts'),
    'utf-8'
  )
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
