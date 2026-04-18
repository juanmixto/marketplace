import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #524 structural regression tests for the checkout client wiring.
 * Easier to maintain than a React Testing Library setup and catches
 * the refactors that historically break idempotency in silence.
 */

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf-8')
}

test('checkout server page generates a fresh attempt id per render', () => {
  const page = read('src/app/(buyer)/checkout/page.tsx')
  assert.ok(
    page.includes("export const dynamic = 'force-dynamic'"),
    'Checkout page MUST be force-dynamic so every render produces a unique token'
  )
  assert.ok(
    page.includes('generateCheckoutAttemptId('),
    'Checkout page MUST call generateCheckoutAttemptId()'
  )
  assert.match(
    page,
    /checkoutAttemptId=\{.*checkoutAttemptId\}/,
    'CheckoutPageClient MUST receive the checkoutAttemptId prop'
  )
})

test('CheckoutPageClient accepts the attempt id and threads it through the submit', () => {
  const client = read('src/components/buyer/CheckoutPageClient.tsx')
  assert.match(
    client,
    /checkoutAttemptId:\s*string/,
    'Props MUST declare checkoutAttemptId: string (not optional)'
  )
  assert.ok(
    client.includes('useRef(checkoutAttemptId)'),
    'Token MUST be captured in a ref so re-renders do not regenerate it mid-submit'
  )
  assert.match(
    client,
    /checkoutAttemptId:\s*attemptIdRef\.current/,
    'createCheckoutOrder MUST receive checkoutAttemptId from the ref'
  )
})

test('CheckoutPageClient routes replayed results to /checkout/confirmacion with replayed=1', () => {
  const client = read('src/components/buyer/CheckoutPageClient.tsx')
  assert.match(
    client,
    /if\s*\(\s*replayed\s*\)/,
    'Submit handler MUST branch on replayed'
  )
  assert.match(
    client,
    /\/checkout\/confirmacion\?orderNumber=\$\{orderNumber\}&replayed=1/,
    'Replay path MUST route to /checkout/confirmacion?orderNumber=…&replayed=1'
  )
})

test('replayed response short-circuits BEFORE the clientSecret handling', () => {
  const client = read('src/components/buyer/CheckoutPageClient.tsx')
  const replayedIdx = client.indexOf('if (replayed)')
  const mockIdx = client.indexOf("clientSecret.startsWith('mock_')")
  assert.ok(replayedIdx !== -1 && mockIdx !== -1, 'Both checks must exist')
  assert.ok(
    replayedIdx < mockIdx,
    'The `if (replayed)` branch MUST execute before the mock auto-confirm branch — otherwise a replay would kick off another mock confirm.'
  )
})
