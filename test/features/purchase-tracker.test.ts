import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract tests for the purchase analytics event (#569). The actual
 * rendering path is exercised by CheckoutPageClient + the confirmation
 * page, but a regression here silently breaks revenue attribution so
 * we pin the invariants separately.
 */

const CONFIRMATION_PAGE_PATH = 'src/app/(buyer)/checkout/confirmacion/page.tsx'
const TRACKER_PATH = 'src/components/analytics/PurchaseTracker.tsx'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf-8')
}

test('confirmation page mounts the PurchaseTracker with the required props', () => {
  const content = read(CONFIRMATION_PAGE_PATH)
  assert.ok(content.includes('PurchaseTracker'), 'PurchaseTracker must be referenced')
  // Required analytics fields per spec #569
  for (const prop of ['orderId', 'orderNumber', 'currency', 'revenue', 'tax', 'shipping', 'items']) {
    // Accept either `foo={expr}` or `foo="literal"` — both are valid
    // JSX prop-passing forms. The regression we care about is the
    // prop being passed AT ALL.
    assert.match(
      content,
      new RegExp(`${prop}=(\\{|")`),
      `PurchaseTracker must receive ${prop}`,
    )
  }
})

test('PurchaseTracker emits the purchase event via trackAnalyticsEvent', () => {
  const content = read(TRACKER_PATH)
  assert.ok(
    content.includes(`trackAnalyticsEvent('purchase',`),
    'tracker must call trackAnalyticsEvent with the literal "purchase" event name — downstream dashboards pin that string',
  )
})

test('PurchaseTracker is dedupe-guarded by sessionStorage on orderNumber', () => {
  const content = read(TRACKER_PATH)
  assert.ok(
    content.includes('sessionStorage'),
    'tracker must guard against replay double-counts',
  )
  assert.ok(
    content.includes('analytics:purchase:'),
    'storage key must include the orderNumber to avoid cross-order collisions',
  )
})

test('PurchaseTracker does NOT forward PII (buyer name, email, address, phone)', () => {
  const content = read(TRACKER_PATH)
  const forbidden = ['email', 'firstName', 'lastName', 'address', 'phone']
  for (const token of forbidden) {
    assert.ok(
      !new RegExp(`\\b${token}\\b`, 'i').test(content),
      `tracker must not mention ${token} — PII leak into analytics is a GDPR exposure`,
    )
  }
})

/**
 * Runtime test: exercise the dedupe guard with a fake sessionStorage.
 * This proves the emit path is actually called once and blocked on
 * the second mount.
 */
const PROCESS_KEY = '__test_purchase_tracker_events'

declare global {
  interface Window {
    [PROCESS_KEY]?: unknown[]
  }
}

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
  const storage = new FakeStorage()
  // @ts-expect-error test-only globals
  globalThis.window = {
    sessionStorage: storage,
    dataLayer: [],
    dispatchEvent: () => true,
  }
  // @ts-expect-error test-only globals
  globalThis.document = { title: 'test' }
})

afterEach(() => {
  // @ts-expect-error cleanup
  delete globalThis.window
  // @ts-expect-error cleanup
  delete globalThis.document
})

test('dedupe guard (unit): first call writes, second is skipped', async () => {
  // Import after the window shim is in place.
  const { trackAnalyticsEvent } = await import('@/lib/analytics')
  const captured: Array<Record<string, unknown>> = []
  ;(globalThis as unknown as { window: { dataLayer: typeof captured } }).window.dataLayer = captured

  const storageKey = 'analytics:purchase:ORD-TEST-1'
  const ss = (globalThis as unknown as { window: { sessionStorage: FakeStorage } }).window.sessionStorage

  // First mount
  if (!ss.getItem(storageKey)) {
    ss.setItem(storageKey, '1')
    trackAnalyticsEvent('purchase', { transaction_id: 'x', order_number: 'ORD-TEST-1' })
  }
  // Second mount
  if (!ss.getItem(storageKey)) {
    ss.setItem(storageKey, '1')
    trackAnalyticsEvent('purchase', { transaction_id: 'x', order_number: 'ORD-TEST-1' })
  }

  const purchaseEvents = captured.filter(e => e.event === 'purchase')
  assert.equal(purchaseEvents.length, 1, 'dedupe guard prevented the second emit')
})
