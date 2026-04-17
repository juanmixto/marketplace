/**
 * Contract: the marketplace mobile UX invariants we just locked in.
 *
 *   1. The root viewport export opts into safe areas (viewport-fit=cover)
 *      and the global stylesheet honours env(safe-area-inset-*) so iOS
 *      notch devices don't clip content.
 *   2. Body scroll is locked whenever the SidebarProvider mobile drawer,
 *      the public Header mobile menu, or the shared Modal is open —
 *      otherwise the background scrolls behind the overlay on touch.
 *   3. Close / hamburger buttons across the panel shells meet the 44px
 *      touch-target minimum via `min-h-11 min-w-11`.
 *   4. Admin tables that rely on horizontal scroll contain it (no page
 *      back-swipe) and expose a dedicated touch pan axis.
 *   5. Vendor ProductForm numeric inputs use `inputMode` so the right
 *      mobile keyboard opens.
 *   6. The buyer checkout address form exposes `autoComplete` tokens so
 *      mobile browsers can prefill contact + address fields.
 *   7. The PDP purchase panel renders a mobile-only sticky add-to-cart
 *      bar, and the cart page renders a mobile-only sticky checkout bar.
 *
 * These invariants are enforced statically so a refactor can't silently
 * drop them — any change to the listed files must keep them intact or
 * update this test in the same PR.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url).pathname, 'utf8')
}

test('root viewport opts into safe areas and body honours env insets', () => {
  const layout = read('src/app/layout.tsx')
  assert.match(layout, /viewportFit:\s*'cover'/, 'layout.tsx viewport must set viewportFit: cover')

  const css = read('src/app/globals.css')
  assert.match(css, /env\(safe-area-inset-left\)/, 'globals.css must use safe-area-inset-left')
  assert.match(css, /env\(safe-area-inset-right\)/, 'globals.css must use safe-area-inset-right')
})

test('SidebarProvider locks body scroll while the mobile drawer is open', () => {
  const source = read('src/components/layout/SidebarProvider.tsx')
  assert.match(
    source,
    /body\.style\.overflow\s*=\s*'hidden'/,
    'SidebarProvider must toggle body.style.overflow when mobileOpen flips',
  )
  assert.match(source, /\[mobileOpen\]/, 'scroll-lock effect must depend on mobileOpen')
})

test('public Header locks body scroll while the mobile menu is open', () => {
  const source = read('src/components/layout/Header.tsx')
  const matches = source.match(/body\.style\.overflow\s*=\s*'hidden'/g) ?? []
  assert.ok(matches.length >= 1, 'Header must lock body scroll when mobileOpen is true')
})

test('Modal locks body scroll while it is open', () => {
  const source = read('src/components/ui/modal.tsx')
  assert.match(
    source,
    /body\.style\.overflow\s*=\s*'hidden'/,
    'Modal must lock body scroll while open',
  )
  assert.match(
    source,
    /body\.style\.overflow\s*=\s*previousOverflow/,
    'Modal must restore the previous overflow on cleanup',
  )
})

test('panel close/hamburger buttons meet 44px tap-target minimum', () => {
  const files = [
    'src/components/ui/modal.tsx',
    'src/components/admin/AdminSidebar.tsx',
    'src/components/vendor/VendorSidebar.tsx',
    'src/components/admin/AdminHeader.tsx',
    'src/components/vendor/VendorHeader.tsx',
    'src/components/layout/Header.tsx',
  ]
  for (const file of files) {
    const source = read(file)
    assert.match(
      source,
      /min-h-11 min-w-11/,
      `${file} must contain a button with min-h-11 min-w-11 for the 44px tap target`,
    )
  }
})

test('admin tables contain horizontal overscroll and opt into touch-pan-x', () => {
  const files = [
    'src/components/admin/AdminPromotionsClient.tsx',
    'src/components/admin/AdminProducersClient.tsx',
    'src/components/admin/AdminSubscriptionsClient.tsx',
    'src/components/admin/analytics/OrdersTable.tsx',
  ]
  for (const file of files) {
    const source = read(file)
    assert.match(
      source,
      /overflow-x-auto overscroll-x-contain touch-pan-x/,
      `${file} must wrap its table with overscroll-x-contain + touch-pan-x`,
    )
  }
})

test('vendor ProductForm numeric inputs declare inputMode for mobile keyboards', () => {
  const source = read('src/components/vendor/ProductForm.tsx')
  // Price fields → decimal keypad; stock / weight → numeric keypad.
  const decimalMatches = source.match(/inputMode="decimal"/g) ?? []
  const numericMatches = source.match(/inputMode="numeric"/g) ?? []
  assert.ok(
    decimalMatches.length >= 2,
    `ProductForm must keep inputMode="decimal" on the base and compareAt price inputs (found ${decimalMatches.length})`,
  )
  assert.ok(
    numericMatches.length >= 2,
    `ProductForm must keep inputMode="numeric" on stock/weight inputs (found ${numericMatches.length})`,
  )
})

test('vendor image uploader exposes an explicit mobile camera action and capture input', () => {
  const source = read('src/components/vendor/ImageUploader.tsx')
  assert.match(
    source,
    /vendor\.upload\.takePhoto/,
    'ImageUploader must expose a visible camera action for mobile users',
  )
  assert.match(source, /capture="environment"/, 'ImageUploader must keep a camera capture input')
  assert.match(source, /accept="image\/\*"/, 'ImageUploader camera input must accept generic images')
})

test('vendor layout keeps vendor content from overflowing horizontally on mobile', () => {
  const source = read('src/app/(vendor)/layout.tsx')
  assert.match(source, /min-w-0 flex-1 flex-col overflow-hidden/, 'vendor shell must allow flex children to shrink')
  assert.match(source, /overflow-y-auto overflow-x-hidden/, 'vendor main must prevent horizontal page scroll on mobile')
})

test('checkout address form exposes autoComplete tokens for mobile prefill', () => {
  const source = read('src/components/buyer/CheckoutPageClient.tsx')
  const required = [
    'autoComplete="given-name"',
    'autoComplete="family-name"',
    'autoComplete="address-line1"',
    'autoComplete="address-line2"',
    'autoComplete="address-level1"',
    'autoComplete="address-level2"',
    'autoComplete="postal-code"',
    'autoComplete="tel"',
  ]
  for (const token of required) {
    assert.ok(
      source.includes(token),
      `CheckoutPageClient must declare ${token} so mobile browsers can prefill`,
    )
  }
})

test('buyer profile form exposes autoComplete tokens', () => {
  const source = read('src/components/buyer/BuyerProfileForm.tsx')
  const required = [
    'autoComplete="given-name"',
    'autoComplete="family-name"',
    'autoComplete="email"',
    'autoComplete="current-password"',
    'autoComplete="new-password"',
  ]
  for (const token of required) {
    assert.ok(source.includes(token), `BuyerProfileForm must declare ${token}`)
  }
})

test('buyer addresses form exposes autoComplete tokens and numeric postal code', () => {
  const source = read('src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx')
  const required = [
    'autoComplete="given-name"',
    'autoComplete="family-name"',
    'autoComplete="address-line1"',
    'autoComplete="address-line2"',
    'autoComplete="address-level1"',
    'autoComplete="address-level2"',
    'autoComplete="postal-code"',
  ]
  for (const token of required) {
    assert.ok(source.includes(token), `DireccionesClient must declare ${token}`)
  }
  assert.match(source, /inputMode="numeric"/, 'postal-code input must use inputMode="numeric"')
})

test('buyer address card actions meet 44px tap-target minimum', () => {
  const source = read('src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx')
  // The three action buttons (edit / set default / delete) now share min-h-11 —
  // contract keeps that from regressing back to bare text-links.
  const matches = source.match(/min-h-11/g) ?? []
  assert.ok(matches.length >= 3, `address actions must keep min-h-11 on edit/default/delete (found ${matches.length})`)
})

test('PDP image gallery controls meet 44px tap-target minimum on mobile', () => {
  const source = read('src/components/catalog/ProductImageGallery.tsx')
  // Chevron buttons must be at least 44px on mobile (sm: resets to compact).
  assert.match(
    source,
    /min-h-11 min-w-11[^"]*sm:min-h-0/,
    'gallery prev/next must use min-h-11 min-w-11 on mobile, reset on sm+',
  )
})

test('SortSelect dropdown clears the 44px tap-target floor', () => {
  const source = read('src/components/catalog/SortSelect.tsx')
  assert.match(source, /min-h-11/, 'SortSelect must use min-h-11 so the dropdown is tappable on mobile')
})

test('vendor PromotionForm selects clear 44px on mobile', () => {
  const source = read('src/components/vendor/PromotionForm.tsx')
  const matches = source.match(/min-h-11 w-full[^"]*sm:h-10 sm:min-h-0/g) ?? []
  assert.ok(
    matches.length >= 2,
    `PromotionForm selects must use min-h-11 sm:h-10 sm:min-h-0 (found ${matches.length})`,
  )
})

test('vendor profile form keeps prep-days inputMode and shrinks textarea on mobile', () => {
  const source = read('src/components/vendor/VendorProfileForm.tsx')
  assert.match(source, /inputMode="numeric"/, 'preparation days input must declare inputMode="numeric"')
  assert.match(source, /type="time"/, 'order cutoff input must use type="time" for the right mobile picker')
  assert.match(
    source,
    /min-h-\[8rem\][^"]*sm:min-h-\[12rem\]/,
    'description textarea must shrink to 8rem on mobile and grow to 12rem on sm+',
  )
})

test('open-incident form select clears 44px and textarea adapts to mobile', () => {
  const source = read('src/app/(buyer)/cuenta/incidencias/nueva/OpenIncidentForm.tsx')
  assert.match(source, /min-h-11/, 'incident type select must clear 44px')
  assert.match(source, /min-h-32[^"]*sm:min-h-40/, 'incident description textarea must scale on sm+')
})

test('buyer subscription action buttons clear the 44px floor', () => {
  const source = read('src/components/buyer/BuyerSubscriptionsListClient.tsx')
  // skip / pause / resume / cancel — at least three of them rendered
  // at any time, all must be tappable.
  const matches = source.match(/min-h-11 px-3 py-2 text-xs font-semibold/g) ?? []
  assert.ok(
    matches.length >= 4,
    `subscription action buttons must use min-h-11 px-3 py-2 (found ${matches.length})`,
  )
})

test('favoritos remove button is a 44px tap target', () => {
  const source = read('src/app/(buyer)/cuenta/favoritos/FavoritosClient.tsx')
  assert.match(
    source,
    /min-h-11 min-w-11/,
    'favorites heart toggle must use min-h-11 min-w-11 so users can tap it on mobile',
  )
})

test('vendor liquidaciones table contains horizontal scroll on mobile', () => {
  const source = read('src/app/(vendor)/vendor/liquidaciones/page.tsx')
  assert.match(
    source,
    /overflow-x-auto overscroll-x-contain touch-pan-x/,
    'liquidaciones table must wrap with overscroll-x-contain + touch-pan-x',
  )
})

test('forgot-password and reset-password forms expose autoComplete', () => {
  const request = read('src/app/(auth)/recuperar-contrasena/RequestForm.tsx')
  assert.match(request, /autoComplete="email"/, 'RequestForm must declare autoComplete="email"')
  assert.match(request, /inputMode="email"/, 'RequestForm must declare inputMode="email"')
  assert.match(request, /min-h-11/, 'RequestForm email input must clear 44px')

  const reset = read('src/app/(auth)/recuperar-contrasena/nueva/ResetForm.tsx')
  const newPassword = reset.match(/autoComplete="new-password"/g) ?? []
  assert.ok(
    newPassword.length >= 2,
    `ResetForm must declare autoComplete="new-password" on both password fields (found ${newPassword.length})`,
  )
})

test('LoginForm forgot-password link is a 44px tap target', () => {
  const source = read('src/components/auth/LoginForm.tsx')
  assert.match(
    source,
    /href="\/forgot-password"[\s\S]*?min-h-11/,
    'forgot-password link must include min-h-11 so it clears the touch target floor',
  )
})

test('Footer link rows clear 44px tap target on mobile', () => {
  const source = read('src/components/layout/Footer.tsx')
  // Two patterns: the column links and the legal row links. Both must
  // bake in min-h-11 so the bottom of the page is actually navigable.
  const matches = source.match(/min-h-11/g) ?? []
  assert.ok(
    matches.length >= 2,
    `Footer must keep min-h-11 on column + legal links (found ${matches.length})`,
  )
})

test('vendor dashboard urgent + setup CTAs clear 44px', () => {
  const source = read('src/app/(vendor)/vendor/dashboard/page.tsx')
  // "Hacer ahora" and "Ver pedidos" both used to be py-1.5 — pin them.
  const matches = source.match(/min-h-11/g) ?? []
  assert.ok(
    matches.length >= 2,
    `dashboard CTAs must keep min-h-11 on doItNow + viewOrders (found ${matches.length})`,
  )
})

test('search pagination links clear 44px', () => {
  const source = read('src/app/(public)/buscar/page.tsx')
  const matches = source.match(/min-h-11 items-center rounded-lg/g) ?? []
  assert.ok(
    matches.length >= 2,
    `search prev/next pagination links must use min-h-11 (found ${matches.length})`,
  )
})

test('vendor review response actions meet 44px tap-target minimum', () => {
  const source = read('src/components/vendor/VendorReviewsManager.tsx')
  const matches = source.match(/min-h-11 min-w-11/g) ?? []
  assert.ok(
    matches.length >= 2,
    `edit + delete vendor-response buttons must use min-h-11 min-w-11 (found ${matches.length})`,
  )
})

test('PDP purchase panel renders a mobile-only sticky add-to-cart bar', () => {
  const source = read('src/components/catalog/ProductPurchasePanel.tsx')
  assert.match(source, /function MobileStickyCta/, 'ProductPurchasePanel must declare a MobileStickyCta helper')
  assert.match(source, /md:hidden/, 'sticky CTA container must hide itself on desktop')
  assert.match(source, /fixed inset-x-0 bottom-0/, 'sticky CTA container must be fixed to the viewport bottom')
  assert.match(source, /env\(safe-area-inset-bottom\)/, 'sticky CTA must honour the home-indicator safe area')
  assert.match(source, /IntersectionObserver/, 'sticky CTA must toggle via IntersectionObserver on the inline CTA')
})

test('cart page renders a mobile-only sticky checkout bar', () => {
  const source = read('src/components/buyer/CartPageClient.tsx')
  assert.match(source, /fixed inset-x-0 bottom-0[^"]*lg:hidden/, 'cart must render a mobile-only fixed checkout bar')
  assert.match(source, /env\(safe-area-inset-bottom\)/, 'cart sticky bar must honour the home-indicator safe area')
})
