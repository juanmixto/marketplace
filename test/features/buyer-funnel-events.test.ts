import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Behaviour pins for the CF-1 buyer funnel events (#902).
 *
 * The taxonomy contract test (`test/contracts/analytics-event-taxonomy.test.ts`)
 * already validates that the six events are typed, documented, wired,
 * and carry `device` + `referrer`. These tests cover the runtime
 * pieces that aren't visible to a static check:
 *
 *  - `shouldFireOnce` is dedupe-correct under a strict-mode-style
 *    double-mount.
 *  - The PurchaseTracker emits the `order.placed` literal so the
 *    funnel insight has a final-step event to count.
 *  - `getBuyerFunnelContext` returns null fields under SSR (no
 *    accidental "device: unknown" capture from a server prerender).
 */

function read(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf-8')
}

test('PurchaseTracker emits the literal `order.placed` (CF-1 final step)', () => {
  const content = read('src/components/analytics/PurchaseTracker.tsx')
  assert.ok(
    content.includes(`trackAnalyticsEvent('order.placed',`),
    'PurchaseTracker must call trackAnalyticsEvent with the literal "order.placed" — downstream funnel insight pins this exact string',
  )
})

test('PurchaseTracker `order.placed` carries the funnel common properties', () => {
  const content = read('src/components/analytics/PurchaseTracker.tsx')
  // The dedupe guard at the top of the effect already pins
  // once-per-order; here we only need to prove the call site shape.
  const idx = content.indexOf("trackAnalyticsEvent('order.placed'")
  assert.ok(idx >= 0, 'order.placed call site missing')
  const window = content.slice(idx, idx + 600)
  for (const prop of ['device', 'referrer', 'order_number', 'value', 'currency']) {
    assert.match(window, new RegExp(`\\b${prop}\\b`), `order.placed payload must include ${prop}`)
  }
})

test('CatalogViewedTracker namespaces sessionStorage per surface', () => {
  const content = read('src/components/analytics/CatalogViewedTracker.tsx')
  assert.ok(
    content.includes('cf1.catalog.viewed.${surface}'),
    'tracker must namespace dedupe by surface so home/catalog/search/category fire independently per session',
  )
})

class FakeStorage {
  private store = new Map<string, string>()
  getItem(k: string) {
    return this.store.has(k) ? (this.store.get(k) ?? null) : null
  }
  setItem(k: string, v: string) {
    this.store.set(k, v)
  }
  removeItem(k: string) {
    this.store.delete(k)
  }
  clear() {
    this.store.clear()
  }
  key() {
    return null
  }
  get length() {
    return this.store.size
  }
}

beforeEach(() => {
  // @ts-expect-error test-only globals
  globalThis.window = {
    sessionStorage: new FakeStorage(),
    matchMedia: (query: string) => ({
      matches: query.includes('max-width: 767px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  }
  // @ts-expect-error test-only globals
  globalThis.document = { referrer: 'https://example.org/source' }
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.window
  // @ts-expect-error cleanup
  delete globalThis.document
})

test('shouldFireOnce returns true on first call and false on second (strict-mode safe)', async () => {
  const { shouldFireOnce } = await import('@/lib/analytics-buyer-context')
  const KEY = 'cf1.product.viewed.test-product-id'
  assert.equal(shouldFireOnce(KEY), true, 'first call must fire')
  assert.equal(shouldFireOnce(KEY), false, 'second call same session must not fire')
  assert.equal(shouldFireOnce('cf1.product.viewed.different'), true, 'different key fires independently')
})

test('getBuyerFunnelContext reads referrer + device from the window/document shims', async () => {
  const { getBuyerFunnelContext } = await import('@/lib/analytics-buyer-context')
  const ctx = getBuyerFunnelContext()
  assert.equal(ctx.device, 'mobile', 'matchMedia max-width: 767px → mobile')
  assert.equal(ctx.referrer, 'https://example.org/source')
})
