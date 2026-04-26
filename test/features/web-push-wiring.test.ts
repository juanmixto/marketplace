import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract pins for the web-push handler wiring. These assertions are
 * intentionally source-text matches (not runtime smoke) so a silent
 * refactor that drops a handler subscription is caught at build time
 * instead of being discovered by a buyer who never got their push.
 *
 * Regressions here mean the dispatcher emits an event but the
 * web-push channel never sees it — the exact failure mode the buyer
 * lived with before #570 was wired, and the reason the whole
 * catalogue exists.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

const REGISTER_PATH = 'src/domains/notifications/web-push/handlers/register.ts'
const ENSURE_PATH = 'src/domains/notifications/web-push/ensure-registered.ts'

test('registerWebPushHandlers subscribes every dispatcher event', () => {
  const src = read(REGISTER_PATH)
  const events = [
    'order.created',
    'order.pending',
    'message.received',
    'order.delivered',
    'label.failed',
    'incident.opened',
    'review.received',
    'payout.paid',
    'stock.low',
    'order.status_changed',
    'favorite.back_in_stock',
    'favorite.price_drop',
  ]
  for (const event of events) {
    assert.match(
      src,
      new RegExp(`on\\(\\s*['"]${event.replace('.', '\\.')}['"]`),
      `${event} must be subscribed in registerWebPushHandlers`,
    )
  }
})

test('registerWebPushHandlers short-circuits when VAPID is not configured', () => {
  const src = read(REGISTER_PATH)
  assert.match(
    src,
    /if\s*\(\s*!isPushEnabled\s*\)\s*return/,
    'must no-op when VAPID keys are missing — prevents dispatcher-only hosts from exploding on first emit',
  )
})

test('registerWebPushHandlers is idempotent via a global flag', () => {
  const src = read(REGISTER_PATH)
  assert.match(
    src,
    /__marketplaceWebPushHandlersRegistered/,
    'must guard duplicate subscription with a globalThis flag (matches the Telegram pattern)',
  )
})

test('ensure-registered delegates idempotency to register (no local latch)', () => {
  const src = read(ENSURE_PATH)
  assert.match(src, /registerWebPushHandlers\s*\(\s*\)/)
  // A local `registered = false` latch on this file used to swallow the
  // first call (made at module-import time before env is set) and prevent
  // any later retry. The single source of truth is the global flag
  // inside `registerWebPushHandlers`, which only latches when VAPID keys
  // are actually present, so a no-config bootstrap can be retried later.
  assert.doesNotMatch(src, /let\s+registered\s*=\s*false/)
})

test('vendors/actions bootstraps the web-push handlers at import time', () => {
  // vendors/actions.ts is the single bootstrap site that also wires the
  // Telegram handlers — web-push mirrors that pattern on purpose. The
  // remaining emit-sites (orders/shipping/reviews/incidents/settlements)
  // load vendors indirectly, so the registration runs before the first
  // dispatcher emit regardless of which action the buyer triggers.
  const src = read('src/domains/vendors/actions.ts')
  assert.match(
    src,
    /ensureWebPushHandlersRegistered\s*\(\s*\)/,
    'vendors/actions.ts must call ensureWebPushHandlersRegistered at module top-level so the first emit is never orphaned',
  )
  assert.match(
    src,
    /ensureTelegramHandlersRegistered\s*\([\s\S]*ensureWebPushHandlersRegistered\s*\(/,
    'both transports must be bootstrapped from the same site — a future PR that drops the Telegram call would otherwise silently drop web-push too',
  )
})
