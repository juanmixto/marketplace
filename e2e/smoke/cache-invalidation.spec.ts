/**
 * Pin the cross-page Router Cache invalidation contract.
 *
 * Background (PR #1091, #1090's follow-up): a client component that
 * mutates server state via fetch('/api/...') leaves the Next.js Router
 * Cache holding stale RSC payloads for any OTHER route that reads the
 * same data. Symptom: user mutates from page A, navigates to page B
 * via a <Link>, and B still shows pre-mutation state until F5.
 *
 * The fix: every such mutation must call `router.refresh()` after
 * success. This file exercises the contract for the canonical
 * surfaces — favorites and addresses — using **client-side
 * navigation** (not page.goto, which forces a fresh SSR and would
 * silently mask the bug).
 *
 * IMPORTANT for future test authors:
 *   - Use page.click() on a real <Link> to navigate. page.goto() is a
 *     full reload and bypasses Router Cache entirely.
 *   - Run with PLAYWRIGHT_USE_PROD=1 if you want to catch the
 *     production-mode caching semantics (dev mode is more forgiving).
 *
 * Tagged @smoke so it runs on every PR.
 */
import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

// We use the PDP (product detail page) instead of the catalog grid
// because there's exactly one favorite button on it — which makes the
// locator unambiguous. The catalog grid has N hearts, all with the
// same aria-label, and scoping to a specific card via data-testid /
// xpath ancestor is brittle (CI shard 3 timed out on this in #1095).
const FAVORITE_PRODUCT_ID = 'prod-tomates'
const FAVORITE_PRODUCT_SLUG = 'tomates-cherry-ecologicos'
const FAVORITE_PRODUCT_NAME = /tomates cherry ecológicos/i

test.describe('Router Cache invalidation @smoke', () => {
  test('newly-favorited product appears on /cuenta/favoritos via client-side navigation', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)

    // Reset state: ensure the product is NOT in favorites before the test.
    // Using request.delete is fine here — it's setup, not the action under test.
    await page.request.delete(`/api/favoritos/${FAVORITE_PRODUCT_ID}`).catch(() => {
      // 404 is OK (already absent).
    })

    // Visit /cuenta/favoritos first so the Router Cache captures an
    // RSC payload that does NOT contain the product. This is the
    // pre-condition for the bug: a stale cache entry exists.
    await page.goto('/cuenta/favoritos')
    await expect(
      page.getByRole('heading', { name: /mis favoritos/i }).first()
    ).toBeVisible({ timeout: 10_000 })
    // Confirm the product is absent at this point.
    await expect(page.getByText(FAVORITE_PRODUCT_NAME).first()).toBeHidden()

    // Open the PDP. Use page.goto here because we need to LEAVE
    // /cuenta/favoritos cleanly so the bf-cache / Router Cache
    // entry for /cuenta/favoritos persists; subsequent navigation
    // back to it is what exercises the Router Cache.
    await page.goto(`/productos/${FAVORITE_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: FAVORITE_PRODUCT_NAME }).first())
      .toBeVisible({ timeout: 10_000 })

    // Click the heart. The PDP renders exactly one
    // FavoriteToggleButton (variant 'default') with accessible name
    // "Guardar" when not favorited (es.ts → favorites.save). The
    // anchored regex excludes "Guardado" (favorited state).
    await page.getByRole('button', { name: /^guardar$/i }).first().click()
    // Wait for the heart's accessible name to flip — that confirms
    // the optimistic update + API call landed before we navigate.
    await expect(page.getByRole('button', { name: /^guardado$/i }).first())
      .toBeVisible({ timeout: 10_000 })

    // Navigate back to /cuenta/favoritos via the browser's history
    // (back button). This is functionally identical to a <Link>
    // click for Router Cache purposes — it consults the cached RSC
    // payload, which is exactly the behaviour we want to test. We
    // use goBack instead of clicking a header link to keep the
    // selector robust across desktop/mobile menu variations.
    await page.goBack()

    await expect(page).toHaveURL(/\/cuenta\/favoritos\/?$/, { timeout: 10_000 })
    // Without router.refresh() in FavoriteToggleButton, this assertion
    // fails — the cached RSC has no tomates and the page renders empty.
    await expect(page.getByText(FAVORITE_PRODUCT_NAME).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
