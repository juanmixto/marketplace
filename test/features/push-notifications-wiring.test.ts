import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract pin for the buyer-facing "your parcel is on the way" wiring.
 *
 * Originally (#570) the push was a direct `sendPushToUser` call with a
 * hand-rolled payload. That path bypassed the notification dispatcher,
 * so the Telegram transport (#611) and the web-push catalogue (#624)
 * could not personalize it. Once both transports were wired through
 * the dispatcher via `order.status_changed`, the direct call became a
 * duplicate — both paths fired on every SHIPPED transition.
 *
 * This test pins the consolidated behaviour: `advanceFulfillment`
 * emits `order.status_changed` through the dispatcher, the transports
 * handle rendering + delivery + preferences, and the direct
 * `sendPushToUser` call is gone.
 */

const ACTIONS_PATH = 'src/domains/vendors/actions.ts'

function readActions(): string {
  return readFileSync(join(process.cwd(), ACTIONS_PATH), 'utf-8')
}

test('advanceFulfillment emits order.status_changed when it lands on SHIPPED', () => {
  const src = readActions()
  assert.match(
    src,
    /if\s*\(\s*nextStatus\s*===\s*'SHIPPED'\s*\)\s*\{[\s\S]*notifyBuyerFulfillmentShipped/,
    'emission must be guarded by the SHIPPED transition — firing on every transition would spam buyers',
  )
  assert.match(
    src,
    /emitNotification\(\s*['"]order\.status_changed['"]/,
    'the buyer notification must flow through the dispatcher so every transport sees it',
  )
})

test('advanceFulfillment no longer bypasses the dispatcher with a direct sendPushToUser', () => {
  const src = readActions()
  assert.doesNotMatch(
    src,
    /sendPushToUser\s*\(/,
    'removing the direct call is what consolidates the flow — a regression would duplicate every SHIPPED push (one direct, one via dispatcher)',
  )
})

test('order.status_changed payload carries orderNumber + vendorName for personalized templates', () => {
  const src = readActions()
  assert.match(
    src,
    /status:\s*'SHIPPED'[\s\S]*orderNumber:[\s\S]*vendorName:/,
    'the dispatcher payload must include orderNumber and vendorName so the buyer-facing copy can name-drop the shop',
  )
})

test('shipped-buyer notification remains fire-and-forget', () => {
  const src = readActions()
  assert.match(
    src,
    /void notifyBuyerFulfillmentShipped\s*\(/,
    'void-prefixed call keeps a broken transport from tearing out of advanceFulfillment',
  )
})
