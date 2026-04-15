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

import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

const SEEDED_PRODUCT_SLUG = 'tomates-cherry-ecologicos'
const SEEDED_CUSTOMER_EMAIL = 'cliente@test.com'
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
    await expect(page.getByText(orderNumber!)).toBeVisible({ timeout: 5_000 })

    // --- DB ASSERTION ---
    // "Confirmation page rendered" is not enough signal — SSR could
    // succeed with no order persisted. Hit Prisma directly to prove
    // the order exists and belongs to the seeded customer.
    const { db } = await import('@/lib/db')
    const order = await db.order.findUnique({
      where: { orderNumber: orderNumber! },
      select: {
        id: true,
        status: true,
        customer: { select: { email: true } },
        lines: { select: { id: true } },
      },
    })
    expect(order, 'order row must exist in DB').not.toBeNull()
    expect(order!.customer.email).toBe(SEEDED_CUSTOMER_EMAIL)
    expect(order!.lines.length, 'order must have at least one line').toBeGreaterThan(0)
  })
})
