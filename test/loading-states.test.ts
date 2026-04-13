/**
 * Loading-state contract tests (#188)
 *
 * These tests guard the patterns required by issue #188:
 *  - Buttons that trigger async work must be disabled during the operation
 *  - They must expose aria-busy=true so screen readers announce the wait
 *  - Double-clicks during pending state must not double-submit
 *
 * Implemented as static-source assertions (the same shape the rest of the
 * repo's contract tests use) so they don't need a DOM and run in the fast
 * non-DB test suite.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('shared Button component sets aria-busy when isLoading (#188)', () => {
  const src = read('src/components/ui/button.tsx')
  // The aria-busy attribute is the accessibility half of the contract: a
  // disabled button is not enough for assistive tech to announce that
  // something is in flight.
  assert.match(
    src,
    /aria-busy=\{isLoading\s*\|\|\s*undefined\}/,
    'Button must set aria-busy={isLoading || undefined}'
  )
  // Defense-in-depth: the spinner SVG itself should be aria-hidden so
  // screen readers don't read it as "image" once the button is announced.
  assert.match(src, /aria-hidden="true"/, 'Button spinner must be aria-hidden')
  // disabled || isLoading must remain — that's how we prevent
  // double-submission on rapid clicks.
  assert.match(
    src,
    /disabled=\{disabled\s*\|\|\s*isLoading\}/,
    'Button must remain disabled while loading'
  )
})

test('LoginForm wires its submit button to a loading state (#188)', () => {
  const src = read('src/components/auth/LoginForm.tsx')
  assert.match(src, /isLoading=\{loading\}/, 'login submit must surface its loading state')
  // The setLoading(true) → await → setLoading(false) pattern must be intact.
  assert.match(src, /setLoading\(true\)/)
  assert.match(src, /setLoading\(false\)/)
})

test('CheckoutPageClient submit button reflects isSubmitting and processing step (#188)', () => {
  const src = read('src/components/buyer/CheckoutPageClient.tsx')
  assert.match(
    src,
    /isLoading=\{isSubmitting \|\| step === 'processing'\}/,
    'place-order button must be loading during submit AND while the order is processing'
  )
})

test('ProductActions Enviar a revisión button is disabled and aria-busy while in flight (#188)', () => {
  const src = read('src/components/vendor/ProductActions.tsx')
  // The raw <button> must set both attributes — using Button would also work,
  // but the file uses a styled <button> for the menu item.
  assert.match(src, /disabled=\{loading\}/, 'must disable while loading')
  assert.match(src, /aria-busy=\{loading \|\| undefined\}/, 'must announce busy state')
  // Label must change so a sighted user without a spinner still gets feedback.
  assert.match(src, /loading \? 'Enviando…'/)
})

test('ProductModerationActions reject button is disabled while approve is pending (#188)', () => {
  const src = read('src/components/admin/ProductModerationActions.tsx')
  // Both moderation buttons share one `loading` state. The approve button
  // already used isLoading={loading}; the reject opener (which mounts the
  // modal) must also be disabled so the admin can't fire two server actions
  // in flight against the same product.
  assert.match(
    src,
    /variant="danger" disabled=\{loading\} onClick=\{\(\) => setRejectModal\(true\)\}/,
    'reject opener must be disabled while approve is in flight'
  )
})

test('AddToCartButton routes through the shared Button so it inherits aria-busy (#188)', () => {
  const src = read('src/components/catalog/AddToCartButton.tsx')
  // The cart-add itself is synchronous (Zustand store), so there's no async
  // work to gate. This test just guards the contract: it MUST go through the
  // shared Button so future async refactors automatically pick up
  // aria-busy and the disabled-while-pending behavior.
  assert.match(src, /import \{ Button[^}]*\} from '@\/components\/ui\/button'/)
  assert.match(src, /<Button[\s\S]*?>/, 'must render a Button, not a raw <button>')
})
