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

test('public Header locks scroll while the mobile menu is open', () => {
  const source = read('src/components/layout/Header.tsx')
  // Either body.style.overflow or html.style.overflow is acceptable; the
  // <html>-based variant is preferred because it doesn't break the drawer's
  // fixed-positioning containing block (see Header.tsx comment).
  const matches =
    source.match(/(?:body|html)\.style\.overflow\s*=\s*'hidden'/g) ?? []
  assert.ok(matches.length >= 1, 'Header must lock scroll when mobileOpen is true')
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
    // Page-level admin tables: each one has a min-w on the inner
    // grid/table and an overflow-x-auto + touch-pan-x wrapper so
    // mobile users get a contained scroll inside the card instead
    // of the document growing wider than the viewport.
    'src/app/(admin)/admin/comisiones/page.tsx',
    'src/app/(admin)/admin/auditoria/page.tsx',
    'src/app/(admin)/admin/envios/page.tsx',
    'src/app/(admin)/admin/notificaciones/page.tsx',
    'src/app/(admin)/admin/ingestion/page.tsx',
    'src/app/(admin)/admin/ingestion/telegram/page.tsx',
    'src/app/(admin)/admin/usuarios/page.tsx',
    'src/app/(admin)/admin/productos/page.tsx',
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
  // `address-level1` (province) was dropped in #1083 — the value is
  // now derived client-side from the postal code's INE prefix and is
  // never an interactive input, so mobile browsers have nothing to
  // prefill there. The remaining tokens still gate the autoComplete
  // contract for the visible inputs.
  const required = [
    'autoComplete="given-name"',
    'autoComplete="family-name"',
    'autoComplete="address-line1"',
    'autoComplete="address-line2"',
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
  // The favorites grid renders the shared FavoriteToggleButton in overlay
  // mode; that component owns the tap-target size for every heart-toggle
  // surface (catalog grid, favorites grid, product detail).
  const source = read('src/components/catalog/FavoriteToggleButton.tsx')
  assert.match(
    source,
    /variant === 'overlay'[\s\S]*?min-h-11 min-w-11/,
    'FavoriteToggleButton overlay variant must use min-h-11 min-w-11 so users can tap it on mobile',
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

test('Tooltip primitive uses Floating UI with viewport collision avoidance and a portal', () => {
  // The previous CSS-only positioning (left-1/2 + translate-x-1/2 anchored to
  // the trigger) clipped off-screen whenever the trigger sat near a viewport
  // edge — even with a width cap. The robust fix is real collision detection
  // via @floating-ui/react: flip + shift + size keep the tooltip inside the
  // viewport regardless of where the trigger lives, and FloatingPortal escapes
  // any overflow:clip / stacking-context ancestor.
  const source = read('src/components/ui/tooltip.tsx')
  assert.match(
    source,
    /from '@floating-ui\/react'/,
    'tooltip must be implemented on top of @floating-ui/react for collision-aware positioning',
  )
  assert.match(
    source,
    /\bflip\(/,
    'tooltip must use flip() so it swaps to the opposite side when the preferred side overflows',
  )
  assert.match(
    source,
    /\bshift\(/,
    'tooltip must use shift() so it slides along the cross axis to stay in the viewport',
  )
  // Width is now controlled by a CSS max-width cap in className
  // (`max-w-[min(14rem,calc(100vw-2rem))]`) plus `whitespace-normal
  // break-words` for line wrapping. The previous size() middleware was
  // collapsing the tooltip to ~80px when the trigger sat in a narrow
  // side panel — the middleware reported availableWidth from the
  // post-flip placement which was tiny, and `Math.min(availableWidth,
  // 224)` produced visually-truncated text inside the tooltip.
  assert.match(
    source,
    /max-w-\[min\(14rem,calc\(100vw-2rem\)\)\]/,
    'tooltip must cap max-width via className so a narrow surrounding container does not collapse the tooltip',
  )
  assert.match(
    source,
    /whitespace-normal[\s\S]*break-words/,
    'tooltip must wrap long text instead of truncating it horizontally',
  )
  assert.match(
    source,
    /FloatingPortal/,
    'tooltip must render through FloatingPortal so it escapes overflow:clip / stacking ancestors',
  )
  assert.match(
    source,
    /useDismiss\(/,
    'tooltip must wire useDismiss so an outside tap or escape closes it on touch devices',
  )
  assert.match(
    source,
    /useFocus\(/,
    'tooltip must wire useFocus so keyboard users (and the touch-tap focus fallback) can open it',
  )
  assert.match(
    source,
    /role="tooltip"|role: 'tooltip'/,
    'the floating element must keep the ARIA tooltip role for screen-reader users',
  )

  const css = read('src/app/globals.css')
  assert.match(
    css,
    /@custom-variant pointer-coarse \(@media \(hover: none\)\)/,
    'globals.css must keep the pointer-coarse custom variant for other touch-aware components',
  )
})

test('cart page renders a mobile-only sticky checkout bar', () => {
  const source = read('src/components/buyer/CartPageClient.tsx')
  assert.match(source, /fixed inset-x-0 bottom-0[^"]*lg:hidden/, 'cart must render a mobile-only fixed checkout bar')
  assert.match(source, /env\(safe-area-inset-bottom\)/, 'cart sticky bar must honour the home-indicator safe area')
})

test('mobile filters drawer renders the panel embedded (no double header / card-in-card)', () => {
  // Without `embedded`, the panel renders its own "Filtros" header and a
  // sticky+rounded card surface — but the Modal already supplies both,
  // so on mobile users see two stacked "Filtros" titles plus a card-in-a-card
  // visual glitch.
  const mobileSrc = read('src/components/catalog/MobileFilters.tsx')
  assert.match(
    mobileSrc,
    /<ProductFiltersPanel[\s\S]*?embedded[\s\S]*?\/>/,
    'MobileFilters must pass `embedded` to the inner ProductFiltersPanel',
  )

  const panelSrc = read('src/components/catalog/ProductFiltersPanel.tsx')
  assert.match(
    panelSrc,
    /embedded\s*=\s*false/,
    'ProductFiltersPanel must accept an `embedded` prop with default false',
  )
  assert.match(
    panelSrc,
    /embedded[\s\S]*?\?\s*''[\s\S]*?:\s*'sticky top-24/,
    'ProductFiltersPanel must drop the sticky/rounded card chrome when embedded',
  )
})

test('next.config.ts forces no-store on /_next/static in dev so phones never see stale chunks', () => {
  // The same root cause as the SW cache, one layer higher: Next dev's
  // default `cache-control: max-age=14400` on /_next/static/* gets
  // pinned in Chrome's HTTP cache, so a refresh on the device serves
  // the chunk it had before today's fix even after the dev server
  // recompiled. Force every dev-mode static request to revalidate.
  const cfg = read('next.config.ts')
  assert.match(
    cfg,
    /if\s*\(isDevelopment\)[\s\S]*?source:\s*'\/_next\/static\/:path\*'[\s\S]*?NO_STORE_CACHE_HEADER/,
    'next.config.ts must apply NO_STORE_CACHE_HEADER to /_next/static/* in dev',
  )
})

test('mobile header replaces the always-on second search row with a magnifier + overlay', () => {
  // The previous design rendered a full-width search input in a second
  // row of the header that scroll-collapsed. On 360px screens it was
  // cramped, easy to mistap, and the scroll-collapse animation reflowed
  // the sticky header on every scroll. We now render a magnifier button
  // in the top bar and open a full-screen overlay on tap (Twitter/IG
  // pattern), which gives the user the full viewport for typing.
  const src = read('src/components/layout/Header.tsx')
  assert.match(
    src,
    /searchOpen,\s*setSearchOpen/,
    'Header must own a searchOpen state for the overlay',
  )
  assert.match(
    src,
    /aria-modal="true"[\s\S]*?fixed inset-0[\s\S]*?z-\[100\]/,
    'mobile search overlay must be a full-screen role=dialog with z-[100]',
  )
  assert.match(
    src,
    /enterKeyHint="search"/,
    'mobile search input must declare enterKeyHint="search" so the keyboard shows the lupa key',
  )
  // The previous always-visible bar and its scroll-collapse logic must
  // be gone — those caused the original UX issues.
  assert.doesNotMatch(
    src,
    /hideMobileSearch/,
    'the legacy hideMobileSearch scroll-collapse logic must be removed',
  )
})

test('root html reads the theme cookie and ships an inline background to suppress the FOUC flash', () => {
  // The previous version hardcoded dark and produced a black flash for
  // light-theme users on refresh. Now the SSR pass reads the
  // THEME_COOKIE_NAME cookie that ThemeCookieSync mirrors from
  // next-themes' resolvedTheme — frame 0 already matches the user's
  // palette in BOTH directions, with a dark fallback on first visit
  // (corrected by the head-resident bootstrap script the moment it runs).
  const src = read('src/app/layout.tsx')
  assert.match(
    src,
    /THEME_COOKIE_NAME/,
    'layout.tsx must read THEME_COOKIE_NAME from next/headers cookies()',
  )
  assert.match(
    src,
    /backgroundColor:\s*initialBg/,
    'root <html> must inline backgroundColor=initialBg derived from the cookie',
  )
  assert.match(
    src,
    /colorScheme:\s*initialTheme/,
    'root <html> must set colorScheme=initialTheme so form controls match the cookie value',
  )
  assert.match(
    src,
    /<head>[\s\S]*?color-scheme[\s\S]*?dark light[\s\S]*?<script/,
    'theme bootstrap script must live in <head> after the color-scheme meta',
  )
  assert.match(
    src,
    /h\.style\.backgroundColor=d\?'#0d1117':'#f5f2ec'/,
    'bootstrap script must paint the inline backgroundColor based on the resolved theme',
  )
  assert.match(
    src,
    /<ThemeCookieSync\s*\/>/,
    'layout.tsx must mount <ThemeCookieSync /> inside <ThemeProvider> so the cookie is kept in sync',
  )

  const sync = read('src/components/ThemeCookieSync.tsx')
  assert.match(
    sync,
    /document\.cookie\s*=[\s\S]*?THEME_COOKIE_NAME/,
    'ThemeCookieSync must write THEME_COOKIE_NAME based on resolvedTheme',
  )
  assert.match(sync, /SameSite=Lax/, 'cookie must be SameSite=Lax')

  const css = read('src/app/globals.css')
  assert.match(
    css,
    /html\s*\{[^}]*color-scheme:\s*light\s+dark/,
    'globals.css must default <html> to color-scheme: light dark so the browser respects the system preference before our JS runs',
  )
})

test('mobile header drawer is reorganised into Mi cuenta / Ajustes / Explorar (no categories)', () => {
  // The old drawer mixed catalog browsing (8 category links) with account
  // links and Cerrar sesión. Categories now live exclusively in the
  // search overlay. The drawer is dedicated to personal/configurable
  // concerns: Mi cuenta, Ajustes (idioma + tema, removed from the always-
  // on top bar to free 360px space), Explorar (Productores).
  const src = read('src/components/layout/Header.tsx')
  assert.match(src, /1\. MI CUENTA/, 'drawer must contain a MI CUENTA section')
  assert.match(src, /2\. AJUSTES/, 'drawer must contain an AJUSTES section')
  assert.match(src, /3\. EXPLORAR/, 'drawer must contain an EXPLORAR section')
  assert.match(src, /4\. SESI/, 'drawer must contain a SESIÓN section for sign-out')
  // The drawer must slide from the right (where the hamburger lives)
  // and NOT occupy the full viewport — leave a sliver for tap-to-close.
  assert.match(
    src,
    /fixed right-0 top-0[\s\S]*?w-\[min\(22rem,88vw\)\]/,
    'drawer must be a right-aligned panel capped at min(22rem, 88vw)',
  )
  assert.match(
    src,
    /backdrop-blur-sm lg:hidden[\s\S]*?aria-label=\{t\('close_menu'\)\}/,
    'drawer must render a tap-to-close backdrop',
  )
  // Sign-out should not be tucked in next to "Mi cuenta" anymore;
  // it lives in its own bottom section that only appears when logged in.
  assert.match(
    src,
    /\/\* ── 4\. SESI[\s\S]*?currentUser && \(\s*<div className="border-t border-\[var\(--border\)\] p-4">[\s\S]*?<SignOutButton/,
    'sign-out must live in a bottom section separated from "Mi cuenta" links',
  )
  // The lang+theme toggles must be inside the drawer (mobile) and hidden
  // from the top bar wrapper.
  assert.match(
    src,
    /<div className="hidden items-center gap-1 lg:flex">[\s\S]*?<LanguageToggle\s*\/>[\s\S]*?<ThemeToggle\s*\/>/,
    'top-bar lang+theme toggles must be wrapped in a hidden lg:flex div on mobile',
  )
  // Categories should NOT be rendered inside {mobileOpen && ...}; loosely
  // enforced by checking that the drawer no longer maps over CATEGORIES.
  const drawerStart = src.indexOf('{/* Mobile drawer')
  const drawerEnd = src.indexOf('</header>', drawerStart)
  const drawerSrc = src.slice(drawerStart, drawerEnd)
  assert.doesNotMatch(
    drawerSrc,
    /CATEGORIES\.map/,
    'drawer must not iterate CATEGORIES — those live in the search overlay now',
  )
})

test('service worker disables /_next/static SWR cache on dev hostnames', () => {
  // Stale chunks in the SW's static cache caused real "I fixed it on disk
  // but the device serves yesterday's bundle" confusion on dev tunnel hosts
  // until the SWR revalidate happened to race a fresh navigation. On dev
  // hosts we now bypass the cache entirely; production keeps it.
  // The list of dev hostnames is injected at build time by scripts/build-sw.mjs
  // from DEV_TUNNEL_HOSTS, so the template carries a placeholder and the
  // build script owns the default during the domain coexistence window.
  const sw = read('public/sw.template.js')
  assert.match(sw, /const DEV_HOSTNAMES = new Set\(__DEV_HOSTNAMES__\)/, 'sw.template.js must declare DEV_HOSTNAMES from the __DEV_HOSTNAMES__ placeholder')
  assert.match(
    sw,
    /DEV_HOSTNAMES\.has\(self\.location\.hostname\)\)\s*return false/,
    'isCacheableStatic must short-circuit to false on dev hostnames so chunks are passthrough',
  )
  const builder = read('scripts/build-sw.mjs')
  assert.match(builder, /__DEV_HOSTNAMES__/, 'build-sw.mjs must substitute the __DEV_HOSTNAMES__ placeholder')
  assert.match(builder, /dev\.raizdirecta\.es/, 'build-sw.mjs default must include dev.raizdirecta.es')
  assert.match(builder, /dev\.feldescloud\.com/, 'build-sw.mjs default must include dev.feldescloud.com during coexistence')
  assert.match(builder, /localhost/, 'build-sw.mjs default must include localhost')
})

test('BuildBadge formats build time in Europe/Madrid, not UTC', () => {
  const source = read('src/components/system/BuildBadge.tsx')
  // Anchor that timestamps are always rendered in Madrid time so dev /
  // staging users can match the badge against their wall clock without
  // doing a +1/+2 conversion in their head.
  const matches = source.match(/timeZone:\s*'Europe\/Madrid'/g) ?? []
  assert.ok(
    matches.length >= 2,
    `BuildBadge must use timeZone: 'Europe/Madrid' on both the short and expanded timestamps (found ${matches.length})`,
  )
  assert.doesNotMatch(
    source,
    /toISOString\(\)\.slice/,
    'BuildBadge must not slice toISOString() for display (it bakes UTC into the badge)',
  )
})

test('Recharts tooltips stay in the viewport, are tappable on touch, and wrap long text', () => {
  // Three invariants for every Recharts <Tooltip> in the codebase:
  //
  //   1. wrapperStyle.pointerEvents === 'auto' so a touch user can dismiss
  //      the tooltip by tapping elsewhere (default is 'none', which traps
  //      the tooltip in a "stuck after tap" state on iOS/Android).
  //   2. wrapperStyle.maxWidth caps to the viewport (`min(280px, calc(100vw - 16px))`)
  //      so wide labels (e.g. a long vendor name + currency) cannot push the
  //      tooltip past the screen edge on a 360px phone.
  //   3. allowEscapeViewBox={{ x: false, y: false }} so even with very small
  //      chart containers the tooltip stays clipped to the chart, not free
  //      to overflow the page.
  //
  // Tooltip styles may be inlined or extracted to a module-scope constant
  // (AdminAnalyticsCharts.tsx does the latter), so these regexes match the
  // literals anywhere in the file rather than only on the <Tooltip> node.
  const files = [
    'src/components/admin/analytics/charts/RankedBarChart.tsx',
    'src/components/admin/analytics/charts/CategoryPieChart.tsx',
    'src/components/admin/analytics/charts/SalesEvolutionChart.tsx',
    'src/components/admin/AdminAnalyticsCharts.tsx',
  ]
  for (const file of files) {
    const source = read(file)
    assert.match(
      source,
      /pointerEvents:\s*'auto'/,
      `${file} must keep pointerEvents: 'auto' on the Recharts wrapper so touch users can dismiss the tooltip`,
    )
    assert.match(
      source,
      /maxWidth:\s*'min\(280px,\s*calc\(100vw\s*-\s*16px\)\)'/,
      `${file} must clamp the Recharts wrapper width to min(280px, calc(100vw - 16px)) so it cannot escape the viewport`,
    )
    assert.match(
      source,
      /allowEscapeViewBox=\{\{\s*x:\s*false,\s*y:\s*false\s*\}\}/,
      `${file} must pass allowEscapeViewBox={{ x: false, y: false }} so the tooltip stays inside the chart container`,
    )
  }
})

test('html and body clip horizontal overflow so a stray wide child cannot scroll the page', () => {
  const css = read('src/app/globals.css')
  // `overflow-x: clip` on html+body is a defensive guard: any child that
  // escapes its container is simply clipped, never gains a horizontal
  // scrollbar at document level. We use `clip` (not `hidden`) so that
  // descendants with `position: sticky` keep working.
  assert.match(
    css,
    /html[\s\S]*?overflow-x:\s*clip/,
    'globals.css must clip horizontal overflow on <html>',
  )
  assert.match(
    css,
    /body[\s\S]*?overflow-x:\s*clip/,
    'globals.css must clip horizontal overflow on <body>',
  )
})

test('public hero stats sit on a single 3-column row across breakpoints', () => {
  const source = read('src/app/(public)/page.tsx')
  assert.match(
    source,
    /grid-cols-3[^"]*"/,
    'hero stats must use grid-cols-3 (KPIs are short numbers — they fit a 360px viewport on one row and stacking eats scroll)',
  )
  assert.doesNotMatch(
    source,
    /grid-cols-1[^"]*sm:grid-cols-3/,
    'hero stats must NOT stack on mobile — that pattern was the previous decision and is being reversed',
  )
})

test('vendor product list search input occupies the full row on mobile', () => {
  const source = read('src/components/vendor/VendorProductListClient.tsx')
  // The toolbar wraps already, but the search field had a 220px floor that
  // pushed the view-toggle group below on every mobile viewport. We now
  // collapse the floor below sm so the search and toggle line up cleanly.
  assert.match(
    source,
    /min-w-0 basis-full sm:basis-auto sm:min-w-\[220px\]/,
    'search input must drop its 220px min-width on mobile and span the row',
  )
})
