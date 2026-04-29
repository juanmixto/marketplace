// Business risk: a cart with products from 2+ vendors must check out
// cleanly. Single-vendor carts are covered by `cart-checkout.spec.ts`;
// this spec extends that flow to the case where the buyer mixes
// items from `finca-garcia` (vegetables) and `queseria-monteazul`
// (cheese). If a regression ever blocks multi-vendor purchases,
// every basket size > 1 vendor silently fails — pre-traction this
// is invisible until a real customer abandons.
//
// Cleanup: same policy as the single-vendor smoke. CI reseeds the
// DB; the test does not unwind Order/OrderLine/Fulfillment rows.
//
// Stock: both seeded products carry stock ≥ 10. Don't bump the
// quantity beyond 1 unless `prisma/seed.ts` is updated to match.

import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

const VENDOR_A_PRODUCT_SLUG = 'tomates-cherry-ecologicos'   // finca-garcia
const VENDOR_B_PRODUCT_SLUG = 'queso-cabra-curado'          // queseria-monteazul

const FALLBACK_CHECKOUT_ADDRESS = {
  firstName: 'Ana',
  lastName: 'Pérez',
  line1: 'Calle Mayor 18',
  province: 'Madrid',
  postalCode: '28001',
  phone: '+34 600 000 000',
}

async function addProductToCart(page: import('@playwright/test').Page, slug: string, headingMatch: RegExp) {
  await page.goto(`/productos/${slug}`)
  await expect(page.getByRole('heading', { name: headingMatch })).toBeVisible({ timeout: 10_000 })
  const addToCart = page.getByRole('button', { name: /añadir al carrito/i }).first()
  await expect(addToCart).toBeEnabled({ timeout: 5_000 })
  await addToCart.click()
  await expect(page.getByRole('button', { name: /añadido/i }).first()).toBeVisible({ timeout: 5_000 })
  // Hard-gate on the cart store actually containing this item before
  // returning. The "Añadido" button text comes from local component
  // state (`setAdded(true)` in AddToCartButton) and fires *before*
  // the next React render commits the Zustand mutation. If the test
  // chains a second `page.goto(...)` immediately, the navigation can
  // race the persist middleware and the second add ends up clobbering
  // the first (or hitting a stale closure on a not-yet-rehydrated
  // store). Reading `localStorage.cart-storage` is the only signal
  // tied to actual persistence — every other flag is local UI state.
  await page.waitForFunction(
    (expectedSlug) => {
      try {
        const raw = window.localStorage.getItem('cart-storage')
        if (!raw) return false
        const parsed = JSON.parse(raw) as { state?: { items?: { slug?: string }[] } }
        return parsed?.state?.items?.some(item => item.slug === expectedSlug) ?? false
      } catch {
        return false
      }
    },
    slug,
    { timeout: 5_000 },
  )
}

test.describe('multi-vendor cart and checkout @smoke', () => {
  test('buyer checks out a cart with products from two different vendors', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAs(page, TEST_USERS.customer)

    await addProductToCart(page, VENDOR_A_PRODUCT_SLUG, /tomates cherry/i)
    await addProductToCart(page, VENDOR_B_PRODUCT_SLUG, /queso.*cabra/i)

    // Cart must show both lines and surface BOTH vendor names. The
    // store renders the vendor name per item (CartPageClient.tsx);
    // if a regression collapses items by product or drops the vendor
    // label, this assertion catches it before checkout.
    await page.goto('/carrito')
    await expect(page.getByRole('heading', { name: /tu carrito/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/finca garc[ií]a/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/queser[ií]a monteazul/i).first()).toBeVisible({ timeout: 10_000 })

    // Checkout: same fallback pattern as the single-vendor smoke. The
    // mock payment provider does not branch on vendor count, so a
    // single confirm-click resolves the whole order.
    await page.goto('/checkout')
    await expect(page).toHaveURL(/\/checkout(?:\/|$|\?)/, { timeout: 25_000 })

    const savedAddress = page.getByTestId('checkout-saved-address').first()
    const savedAddressReady = await savedAddress
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)

    if (savedAddressReady) {
      await savedAddress.click()
    } else {
      await page.getByRole('textbox', { name: /nombre/i }).fill(FALLBACK_CHECKOUT_ADDRESS.firstName)
      await page.getByRole('textbox', { name: /apellidos/i }).fill(FALLBACK_CHECKOUT_ADDRESS.lastName)
      await page.getByRole('textbox', { name: /dirección/i }).fill(FALLBACK_CHECKOUT_ADDRESS.line1)
      await page.getByRole('combobox', { name: /provincia/i }).selectOption({ label: FALLBACK_CHECKOUT_ADDRESS.province })
      await page.getByRole('textbox', { name: /código postal/i }).fill(FALLBACK_CHECKOUT_ADDRESS.postalCode)
      await page.getByRole('textbox', { name: /teléfono/i }).fill(FALLBACK_CHECKOUT_ADDRESS.phone)
    }

    const confirm = page.getByRole('button', { name: /confirmar pedido/i }).first()
    await expect(confirm).toBeEnabled({ timeout: 5_000 })
    await Promise.all([
      page.waitForURL(/\/checkout\/confirmacion\?orderNumber=/, { timeout: 25_000 }),
      confirm.click({ noWaitAfter: true }),
    ])

    const orderNumber = new URL(page.url()).searchParams.get('orderNumber')
    expect(orderNumber, 'confirmation URL must include an orderNumber').toBeTruthy()
    await expect(page.getByText(orderNumber!)).toBeVisible({ timeout: 5_000 })
  })
})
