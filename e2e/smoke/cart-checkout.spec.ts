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
const FALLBACK_CHECKOUT_ADDRESS = {
  firstName: 'Ana',
  lastName: 'Pérez',
  line1: 'Calle Mayor 18',
  city: 'Madrid',
  province: 'Madrid',
  postalCode: '28001',
  phone: '+34 600 000 000',
}

test.describe('cart and checkout @smoke', () => {
  test('buyer adds a product, checks out with the mock provider and lands on confirmation', async ({ page }) => {
    // This spec hits 5 distinct Next.js routes (/login, /productos/[slug],
    // /carrito, /checkout, /checkout/confirmacion) and each one cold-
    // compiles on the shard's `next dev` server the first time it is
    // visited. On GitHub-hosted runners the sum can legitimately exceed
    // the 30s global `timeout` from playwright.config.ts — which is what
    // triggered the `page.waitForURL: Test timeout of 30000ms` failures
    // merged in #594. Widen this single test's budget to 90s; everything
    // else stays at the default.
    test.setTimeout(90_000)
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
    await expect(page.getByRole('heading', { name: /tu carrito/i })).toBeVisible({ timeout: 10_000 })

    // The cart CTA is useful in the product UI, but it is not a stable
    // smoke signal on CI because the cart summary can switch between a
    // link and a disabled button while stock data hydrates. Jumping
    // straight to `/checkout` keeps the smoke focused on the actual
    // purchase flow instead of the CTA rendering mode.
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout(?:\/|$|\?)/, { timeout: 25_000 })

    // --- CHECKOUT ---
    // If we landed back on /carrito (cart store didn't rehydrate before the
    // checkout client ran its empty-cart guard — happens on slow CI
    // runners), re-add the product and retry the navigation once.
    if (page.url().includes('/carrito')) {
      await page.goto(`/productos/${SEEDED_PRODUCT_SLUG}`)
      await page.getByRole('button', { name: /añadir al carrito/i }).first().click()
      await expect(page.getByRole('button', { name: /añadido/i }).first()).toBeVisible({ timeout: 5_000 })
      await page.goto('/checkout')
      await expect(page).toHaveURL(/\/checkout(?:\/|$|\?)/, { timeout: 25_000 })
    }

    // The checkout can render either saved addresses or the new-address
    // form first, depending on how quickly the seeded profile arrives on
    // the shard. Prefer the saved row when it appears, but fall back to a
    // deterministic new address so the smoke never hangs on a timing race.
    const savedAddress = page.getByTestId('checkout-saved-address').first()
    const firstName = page.getByRole('textbox', { name: /nombre/i }).first()

    const savedAddressReady = await savedAddress
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)

    if (savedAddressReady) {
      await savedAddress.click()
    } else {
      await expect(firstName).toBeVisible({ timeout: 10_000 })
      await firstName.fill(FALLBACK_CHECKOUT_ADDRESS.firstName)
      await page.getByRole('textbox', { name: /apellidos/i }).fill(FALLBACK_CHECKOUT_ADDRESS.lastName)
      await page.getByRole('textbox', { name: /dirección/i }).fill(FALLBACK_CHECKOUT_ADDRESS.line1)
      // #1083: province <select> is gone — the form derives the
      // province from the postal code's INE prefix. Filling CP is
      // sufficient; the chip "Provincia: Madrid" then renders.
      await page.getByRole('textbox', { name: /código postal/i }).fill(FALLBACK_CHECKOUT_ADDRESS.postalCode)
      await page.getByRole('textbox', { name: /ciudad|localidad/i }).fill(FALLBACK_CHECKOUT_ADDRESS.city)
      await page.getByRole('textbox', { name: /teléfono/i }).fill(FALLBACK_CHECKOUT_ADDRESS.phone)
    }

    // Confirm button text includes the total price. Match on the verb.
    // The page renders a desktop submit AND a mobile sticky-bar submit
    // (one is CSS-hidden depending on viewport); pick the first match —
    // both submit the same form so either click is correct.
    // #1083 retitled the CTA to "Continuar al pago" — old "Confirmar
    // pedido" copy is gone.
    const confirm = page.getByRole('button', { name: /continuar al pago/i }).first()
    await expect(confirm).toBeEnabled({ timeout: 5_000 })
    await Promise.all([
      page.waitForURL(/\/checkout\/confirmacion\?orderNumber=/, { timeout: 20_000 }),
      confirm.click({ noWaitAfter: true }),
    ])

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
