// Highest-value smoke spec in Phase 1: exercises the full buyer happy
// path through add-to-cart → cart → checkout → confirmation, against
// the mock payment provider.
//
// Cleanup policy: the test does NOT delete the Order row it creates.
// Rationale: the CI e2e-smoke job reseeds the database on every run
// (see .github/workflows/ci.yml), so orphaned orders from a previous
// run never accumulate there. Locally the developer owns DB hygiene.
// Deleting Orders here would require unwinding OrderLine, Payment,
// VendorFulfillment, ShippingLabel, and OrderEvent rows — way more
// surface area than the value justifies for a smoke test.
//
// DB-level assertion: dropped. Importing `@/lib/db` from a Playwright
// spec forces the runner to evaluate the Next.js module graph (Prisma
// adapter, server env) and fails with a bare-ESM error. The signal we
// actually need — that an order was persisted, not just rendered — is
// covered transitively: `/checkout/confirmacion` fetches the order
// by `orderNumber` and returns `orderConfirmation.notFound` copy if
// no row exists. Asserting the order number is visible on that page
// is therefore equivalent to asserting the DB row exists.

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { TEST_USERS, loginAs } from '../helpers/auth'

const SEEDED_PRODUCT_SLUG = 'tomates-cherry-ecologicos'
const SEEDED_ADDRESS_LINE1 = 'Calle Mayor 18'

test.describe('cart and checkout @smoke', () => {
  test('buyer adds a product, checks out with the mock provider and lands on confirmation', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)

    // --- PRODUCT DETAIL → ADD TO CART ---
    await page.goto(`/productos/${SEEDED_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: /tomates cherry/i })).toBeVisible({ timeout: 10_000 })

    const addToCart = page.getByRole('button', { name: /añadir al carrito/i }).first()
    await expect(addToCart).toBeEnabled({ timeout: 5_000 })
    await addToCart.click()
    // The button text flips to "Añadido" for ~2s after a successful add —
    // a reliable signal the Zustand store received the item.
    await expect(page.getByRole('button', { name: /añadido/i }).first()).toBeVisible({ timeout: 5_000 })

    // --- CART ---
    await page.goto('/carrito')
    await expect(page.getByText(/tomates cherry/i).first()).toBeVisible({ timeout: 5_000 })

    const toCheckout = page.getByRole('link', { name: /ir al checkout/i }).first()
    await toCheckout.click()
    await expect(page).toHaveURL(/\/checkout(?:\/|$|\?)/, { timeout: 10_000 })

    // --- CHECKOUT ---
    // The seeded customer has a default address (`Calle Mayor 18`, Madrid).
    // Wait for saved addresses to load so the preferred one is auto-
    // selected and handleConfirmClick can bypass client-side validation.
    await expect(page.getByText(SEEDED_ADDRESS_LINE1)).toBeVisible({ timeout: 10_000 })

    // Confirm button text includes the total price. Match on the verb.
    const confirm = page.getByRole('button', { name: /confirmar pedido/i })
    await expect(confirm).toBeEnabled({ timeout: 5_000 })
    await confirm.click()

    // --- CONFIRMATION ---
    await expect(page).toHaveURL(/\/checkout\/confirmacion\?orderNumber=/, { timeout: 15_000 })

    const orderNumber = new URL(page.url()).searchParams.get('orderNumber')
    expect(orderNumber, 'confirmation URL must include an orderNumber').toBeTruthy()

    // The confirmation page server-renders order.orderNumber only when
    // db.order.findUnique({ where: { orderNumber } }) returns a row that
    // belongs to the current customer. If no such row exists the page
    // instead renders the "notFound" / "accessDenied" heading. Asserting
    // the order number is visible is therefore equivalent to asserting
    // both persistence and ownership — the DB-level check we would
    // otherwise run via Prisma.
    await expect(page.getByText(orderNumber!)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('heading', { name: /pedido|orden|gracias/i }).first()).toBeVisible()

    // --- A11Y ASSERTION ---
    // Run axe on the fully hydrated confirmation page — the one users
    // actually land on after a purchase. WCAG A/AA, but filtered to
    // `impact=critical` only. The site carries ~300 pre-existing
    // moderate/serious violations (color-contrast on dark-mode tokens,
    // landmark issues, heading-order quirks) that are a separate
    // project to fix. This gate blocks new critical regressions
    // without holding the PR hostage to the baseline.
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const critical = results.violations.filter(v => v.impact === 'critical')
    expect(
      critical,
      `confirmation page has ${critical.length} critical axe violations: ${critical.map(v => v.id).join(', ')}`,
    ).toEqual([])
  })
})
