/**
 * Cart loading-state contract tests (#132)
 *
 * The cart store itself is fully client-side (Zustand), so the
 * "optimistic update" the issue asks for is implicit — every cart
 * mutation updates the UI synchronously. The async surface that actually
 * needed feedback is the stock-availability check that runs every time
 * the cart changes: a slow network there used to leave the user clicking
 * +/- and the trash icon while a stale check was still in flight, which
 * caused races and visible jank.
 *
 * These tests guard the contract:
 *   - cart controls are disabled during the in-flight stock check
 *   - the cart list announces aria-busy while the check is running
 *   - the minus button is disabled at quantity 1 (so the user can't
 *     accidentally remove an item by clicking minus)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(
  new URL('../../src/components/buyer/CartPageClient.tsx', import.meta.url),
  'utf8'
)

test('cart list section announces aria-busy while stock is being checked (#132)', () => {
  assert.match(
    SRC,
    /aria-busy=\{checkingStock \|\| undefined\}/,
    'cart list must surface aria-busy during the in-flight stock check'
  )
})

test('quantity − button is disabled at quantity 1 to prevent accidental removal (#132)', () => {
  // A user clicking − repeatedly used to silently remove the item once it
  // hit zero, with no confirmation. The trash icon is the explicit
  // affordance — minus must stop at 1.
  assert.match(
    SRC,
    /disabled=\{item\.quantity <= 1 \|\| checkingStock\}/,
    'minus button must guard against item.quantity <= 1'
  )
})

test('quantity controls and trash button are disabled during stock check (#132)', () => {
  // Each control checked separately so a refactor that drops one is caught.
  const minusGuard = SRC.match(/disabled=\{item\.quantity <= 1 \|\| checkingStock\}/)
  const inputGuard = SRC.match(/disabled=\{checkingStock\}\s+onChange=\{event/)
  const plusGuard = SRC.match(/disabled=\{checkingStock \|\| \(available !== null && item\.quantity >= available\)\}/)
  // Trash button uses disabled={checkingStock} on a different line; match
  // against its aria-label context to avoid catching the clear-cart guard.
  const trashGuard = SRC.match(
    /aria-label=\{`Eliminar [^`]+`\}\s+disabled=\{checkingStock\}/
  )

  assert.ok(minusGuard, 'minus button must be disabled while checkingStock')
  assert.ok(inputGuard, 'quantity input must be disabled while checkingStock')
  assert.ok(plusGuard, 'plus button must be disabled while checkingStock')
  assert.ok(trashGuard, 'trash button must be disabled while checkingStock')
})

test('clear-cart button is disabled while stock is being checked (#132)', () => {
  // Most destructive single-click action in the page — clearing the entire
  // cart while a stock check is mid-flight would leak the result into an
  // empty state. Disable it for the same reason as the per-item controls.
  assert.match(
    SRC,
    /onClick=\{clearCart\}[\s\S]*?disabled=\{checkingStock\}/,
    'clear-cart must be disabled while checkingStock'
  )
})

test('cart store updates remain synchronous (the optimistic guarantee, #132)', () => {
  // Defensive: if anyone ever switches the store to async server actions,
  // the contract above stops being enough — the user would need full
  // optimistic-update + revert-on-error wiring. This test fires when that
  // refactor lands so we remember to expand the contract first.
  const storeSrc = readFileSync(
    new URL('../../src/domains/orders/cart-store.ts', import.meta.url),
    'utf8'
  )
  // Match: addItem / removeItem / updateQty are *not* declared async.
  assert.ok(!/addItem:\s*async/.test(storeSrc), 'addItem must remain synchronous')
  assert.ok(!/removeItem:\s*async/.test(storeSrc), 'removeItem must remain synchronous')
  assert.ok(!/updateQty:\s*async/.test(storeSrc), 'updateQty must remain synchronous')
})

test('cart page waits for hydration before showing the empty state', () => {
  assert.match(SRC, /const cartHydrated = useCartStore\(state => state\.hasHydrated\)/)
  assert.match(SRC, /if \(!cartHydrated\) \{\s+return \(/)
  assert.match(SRC, /Cargando tu carrito…/)
  assert.match(SRC, /if \(items\.length === 0\) \{/)
})
