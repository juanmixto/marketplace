// Business risk: a buyer adds an item while browsing anonymously,
// logs in to complete the purchase, and the cart silently empties.
// We have unit + integration tests for `mergeLocalIntoServerCart`
// (test/features/cart-hydration-plan.test.ts and
// test/integration/cart-hydration.test.ts) but no E2E that exercises
// the actual browser path: localStorage → NextAuth session → server
// merge → /carrito render.
//
// This is the single most likely abandonment point at signup, so a
// smoke gate is justified despite the cost of an extra spec.

import { test, expect } from '@playwright/test'
import { TEST_USERS } from '../helpers/auth'

const SEEDED_PRODUCT_SLUG = 'tomates-cherry-ecologicos'

test.describe('cart survives anonymous → login @smoke', () => {
  test('item added while logged out is present in cart after login', async ({ page }) => {
    test.setTimeout(90_000)

    // --- ANONYMOUS: add to cart ---
    // No `loginAs()` call: this run starts with no session cookie.
    await page.goto(`/productos/${SEEDED_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: /tomates cherry/i })).toBeVisible({ timeout: 10_000 })

    const addToCart = page.getByRole('button', { name: /añadir al carrito/i }).first()
    await expect(addToCart).toBeEnabled({ timeout: 5_000 })
    await addToCart.click()
    // Same "Añadido" affordance as the other cart smokes — confirms the
    // Zustand store accepted the item before we navigate away.
    await expect(page.getByRole('button', { name: /añadido/i }).first()).toBeVisible({ timeout: 5_000 })

    // --- LOGIN ---
    // Inline login (instead of helpers/auth.ts loginAs) so the same Page
    // — and therefore the same localStorage — is reused. Calling
    // `loginAs` would still work but it goes via `page.goto('/login')`,
    // which is exactly what we do here; the helper just wraps the same
    // sequence.
    await page.goto('/login', { waitUntil: 'commit' })
    const submit = page.getByRole('button', { name: 'Iniciar sesión' })
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await page.locator('input[name="email"]').fill(TEST_USERS.customer.email)
    await page.locator('input[name="password"]').fill(TEST_USERS.customer.password)
    await Promise.all([
      page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20_000 }),
      submit.click(),
    ])

    // --- POST-LOGIN CART ---
    // CartHydrationProvider runs on the client after `useSession()`
    // flips to "authenticated". It calls mergeLocalIntoServerCart and
    // then reloads the server cart into the store. The smoke succeeds
    // if /carrito shows the product we added anonymously — that is
    // the merge's only user-visible contract.
    await page.goto('/carrito')
    await expect(page.getByRole('heading', { name: /tu carrito/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/tomates cherry/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
