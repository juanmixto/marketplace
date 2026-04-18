import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract pin for the first live push-notification wiring (#570).
 * Regression in any of these assertions silently breaks the buyer's
 * "your parcel is on the way" push, which is the one event the
 * subscribe-flow was shipped for.
 */

const ACTIONS_PATH = 'src/domains/vendors/actions.ts'

function readActions(): string {
  return readFileSync(join(process.cwd(), ACTIONS_PATH), 'utf-8')
}

test('advanceFulfillment fires a push when the transition lands on SHIPPED', () => {
  const src = readActions()
  // The helper must exist and the fire-and-forget callsite must
  // reference it inside the `if (nextStatus === 'SHIPPED')` branch.
  assert.match(src, /notifyBuyerFulfillmentShipped/, 'helper must be defined')
  assert.match(
    src,
    /if\s*\(\s*nextStatus\s*===\s*'SHIPPED'\s*\)\s*\{[\s\S]*notifyBuyerFulfillmentShipped/,
    'the push must be guarded by the SHIPPED transition — firing on every transition would spam buyers',
  )
})

test('push helper is fire-and-forget — a failure never blocks the vendor UI', () => {
  const src = readActions()
  assert.match(
    src,
    /void notifyBuyerFulfillmentShipped[\s\S]*\.catch\(/,
    'the call must be `void helper(...).catch(...)` so a web-push error does not throw out of advanceFulfillment',
  )
})

test('push helper uses the official sendPushToUser API (graceful degradation)', () => {
  const src = readActions()
  assert.match(
    src,
    /import\(\s*['"]@\/lib\/pwa\/push-send['"]\s*\)/,
    'the helper must import from src/lib/pwa/push-send so the `no VAPID → no-op` and stale-subscription cleanup behaviour is preserved',
  )
  assert.match(src, /sendPushToUser\s*\(/, 'must call sendPushToUser, not ad-hoc web-push')
})

test('push payload includes a deep-link to the buyer order detail', () => {
  const src = readActions()
  assert.match(
    src,
    /url:\s*`\/cuenta\/pedidos\/\$\{orderId\}`/,
    'the push must deep-link into the buyer order detail so a tap lands on the tracking page',
  )
})

test('push payload is tagged so repeat shipments of the same order collapse in the tray', () => {
  const src = readActions()
  assert.match(
    src,
    /tag:\s*`order-shipped-\$\{orderId\}`/,
    'tag pins the notification to the order so multiple fulfillments in the same order don\'t pile up',
  )
})
