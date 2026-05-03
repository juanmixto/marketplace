import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pin observability logs on the fail-open early-return paths in every
 * notification handler. PR 1B of the bug-reduction plan
 * (`/home/whisper/.claude/plans/ahora-despu-s-de-esta-smooth-mango.md`,
 * Gap 1 → PR 1B) requires that no handler skip is silent: each `return`
 * that drops a notification because data was missing must emit a
 * `notifications.handler.skipped` log first so the Notification Health
 * dashboard (PR 3A) can detect drift.
 *
 * The contract is intentionally enforced as a file-content pin so that
 * - removing a `logger.warn` mid-refactor breaks the build;
 * - a renamed scope is caught before the dashboard query goes stale;
 * - a future handler added without the same instrumentation is flagged
 *   the moment its file appears in this list.
 */

interface HandlerExpectation {
  file: string
  reasons: string[]
  /** Sub-handlers (event names from the payload's flow) per reason set. */
  events: string[]
}

const SKIP_SCOPE = 'notifications.handler.skipped'

const HANDLERS: HandlerExpectation[] = [
  {
    file: 'src/domains/notifications/telegram/handlers/on-order-created.ts',
    reasons: ['no_vendor'],
    events: ['order.created'],
  },
  {
    file: 'src/domains/notifications/telegram/handlers/on-order-pending.ts',
    reasons: ['no_vendor'],
    events: ['order.pending'],
  },
  {
    file: 'src/domains/notifications/telegram/handlers/on-message-received.ts',
    reasons: ['no_vendor'],
    events: ['message.received'],
  },
  {
    file: 'src/domains/notifications/telegram/handlers/on-vendor-alerts.ts',
    reasons: ['no_vendor'],
    events: [
      'order.delivered',
      'label.failed',
      'incident.opened',
      'review.received',
      'payout.paid',
      'stock.low',
    ],
  },
  {
    file: 'src/domains/notifications/telegram/handlers/on-favorite-price-drop.ts',
    reasons: ['no_favorites'],
    events: ['favorite.price_drop'],
  },
  {
    file: 'src/domains/notifications/telegram/handlers/on-favorite-restock.ts',
    reasons: ['no_favorites'],
    events: ['favorite.back_in_stock'],
  },
  {
    file: 'src/domains/notifications/telegram/handlers/order-view.ts',
    reasons: ['no_order'],
    events: ['order.view'],
  },
  {
    file: 'src/domains/notifications/telegram/controller.ts',
    reasons: ['no_text'],
    events: ['telegram.message'],
  },
  {
    file: 'src/domains/notifications/web-push/handlers/on-order-created.ts',
    reasons: ['no_vendor'],
    events: ['order.created'],
  },
  {
    file: 'src/domains/notifications/web-push/handlers/on-order-pending.ts',
    reasons: ['no_vendor'],
    events: ['order.pending'],
  },
  {
    file: 'src/domains/notifications/web-push/handlers/on-message-received.ts',
    reasons: ['no_vendor'],
    events: ['message.received'],
  },
  {
    file: 'src/domains/notifications/web-push/handlers/on-vendor-alerts.ts',
    reasons: ['no_vendor'],
    events: [
      'order.delivered',
      'label.failed',
      'incident.opened',
      'review.received',
      'payout.paid',
      'stock.low',
    ],
  },
  {
    file: 'src/domains/notifications/web-push/handlers/on-favorite-restock.ts',
    reasons: ['no_favorites'],
    events: ['favorite.back_in_stock'],
  },
  {
    file: 'src/domains/notifications/web-push/handlers/on-favorite-price-drop.ts',
    reasons: ['no_favorites'],
    events: ['favorite.price_drop'],
  },
]

for (const handler of HANDLERS) {
  test(`${handler.file} logs ${SKIP_SCOPE} before each fail-open return`, () => {
    const src = readFileSync(join(process.cwd(), handler.file), 'utf-8')
    assert.ok(
      src.includes(`'${SKIP_SCOPE}'`),
      `${handler.file} must call logger.warn('${SKIP_SCOPE}', …) before its early returns. ` +
        'Without this, a handler that fails open silently has no telemetry — exactly the regression PR 1B exists to prevent.',
    )
    for (const reason of handler.reasons) {
      assert.ok(
        src.includes(`reason: '${reason}'`),
        `${handler.file} must surface reason: '${reason}' in its skip log. ` +
          `The Notification Health dashboard (PR 3A) groups by reason; renaming this without updating the dashboard query collapses the bucket.`,
      )
    }
    for (const event of handler.events) {
      assert.ok(
        src.includes(`event: '${event}'`),
        `${handler.file} must surface event: '${event}' in its skip log. ` +
          `Dashboards filter by event; renaming this is a downstream alerting break.`,
      )
    }
  })
}

test('on-vendor-alerts (telegram) covers all 6 alert handlers with skip logs', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/domains/notifications/telegram/handlers/on-vendor-alerts.ts'),
    'utf-8',
  )
  // Each of the 6 handlers must emit one warn — count the scope occurrences.
  const occurrences = (src.match(new RegExp(`'${SKIP_SCOPE}'`, 'g')) ?? []).length
  assert.equal(
    occurrences,
    6,
    `Expected 6 skip-log emissions in on-vendor-alerts.ts (one per handler), got ${occurrences}. ` +
      'A new alert handler added without instrumentation regresses observability.',
  )
})

test('on-vendor-alerts (web-push) covers all 6 alert handlers with skip logs', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/domains/notifications/web-push/handlers/on-vendor-alerts.ts'),
    'utf-8',
  )
  const occurrences = (src.match(new RegExp(`'${SKIP_SCOPE}'`, 'g')) ?? []).length
  assert.equal(
    occurrences,
    6,
    `Expected 6 skip-log emissions in web-push on-vendor-alerts.ts (one per handler), got ${occurrences}.`,
  )
})

test('telegram config logs notifications.config.missing when env is incomplete', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/domains/notifications/telegram/config.ts'),
    'utf-8',
  )
  assert.ok(
    src.includes(`'notifications.config.missing'`),
    'getTelegramConfig() must log notifications.config.missing when any of the required env vars is unset. ' +
      'A missing token currently turns Telegram into a silent no-op for notifications and webhooks alike — without this log nobody knows.',
  )
  assert.ok(
    src.includes(`subsystem: 'telegram'`),
    'config.missing payload must carry subsystem: \'telegram\' so multi-subsystem dashboards (email, web-push) can co-exist.',
  )
  assert.ok(
    src.includes('TELEGRAM_BOT_TOKEN') &&
      src.includes('TELEGRAM_WEBHOOK_SECRET') &&
      src.includes('TELEGRAM_BOT_USERNAME'),
    'config.missing payload must list each missing env-var name (no values) so oncall can act without poking secrets.',
  )
})

// ─── PII safety ──────────────────────────────────────────────────────────────

test('skip-log payloads do not log PII (no email / firstName / message body)', () => {
  // Walk every handler file we instrument and assert that the skip log does
  // not pull a PII field into its payload. This is a static check — keeps
  // the GDPR boundary visible in the test suite, not just in code review.
  for (const handler of HANDLERS) {
    const src = readFileSync(join(process.cwd(), handler.file), 'utf-8')
    // Extract the slice between every `'notifications.handler.skipped'` and the
    // closing `})` so we only inspect log-arg objects (not surrounding code).
    const matches = src.matchAll(/'notifications\.handler\.skipped'[\s\S]*?\}\)/g)
    for (const match of matches) {
      const slice = match[0]
      for (const piiKey of [
        'email',
        'firstName',
        'lastName',
        'customerName',
        'fromUserName',
        'preview',
        'body',
        'description',
      ]) {
        assert.ok(
          !new RegExp(`\\b${piiKey}\\b`).test(slice),
          `${handler.file}: skip-log payload referenced PII-shaped field "${piiKey}". Use IDs only.`,
        )
      }
    }
  }
})
