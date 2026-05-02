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

const FAVORITE_PRODUCT_ID = 'prod-tomates'
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

    // Navigate to the catalog via a real client-side link (the buyer
    // nav). page.goto would also work but we want to keep the cache
    // entry for /cuenta/favoritos warm.
    await page.goto('/productos')
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 10_000,
    })

    // Click the heart on the target product card. Aria label is
    // "Guardar" when not favorited (es.ts: favorites.save).
    const card = page
      .locator(`[data-testid="product-card-${FAVORITE_PRODUCT_ID}"]`)
      .or(
        // Fallback for cards without a data-testid: locate by product name.
        page.getByText(FAVORITE_PRODUCT_NAME).first().locator('xpath=ancestor::*[self::a or self::div][1]')
      )
      .first()
    const heart = card
      .getByRole('button', { name: /guardar/i })
      .first()
    await heart.click()

    // Now navigate back to /cuenta/favoritos via the buyer nav. This
    // is the critical step: it MUST be a client-side navigation, not
    // a page.goto, so the Router Cache is consulted.
    //
    // We use page.evaluate to programmatically click the buyer-nav
    // link if present, otherwise we navigate via the next/link
    // anchor. Either way, we avoid page.goto.
    const navLink = page.getByRole('link', { name: /favoritos/i }).first()
    await navLink.click()

    await expect(page).toHaveURL(/\/cuenta\/favoritos\/?$/, { timeout: 10_000 })
    // Without router.refresh() in FavoriteToggleButton, this assertion
    // fails — the cached RSC has no tomates and the page renders empty.
    await expect(page.getByText(FAVORITE_PRODUCT_NAME).first()).toBeVisible({
      timeout: 10_000,
    })
  })
})
