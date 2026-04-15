// Buyer subscription checkout smoke. Walks a logged-in customer from
// the product page of a box that has a seeded subscription plan, through
// the confirmation form (address + first-delivery date picker), through
// the mock Stripe checkout redirect, to the /cuenta/suscripciones page
// where the new row must show up with a welcome banner.
//
// Cleanup policy: same as cart-checkout.spec.ts — the test does NOT
// delete the Subscription row it creates. CI reseeds the database on
// every run; locally re-running the test requires `npm run db:seed`
// because startSubscriptionCheckout refuses a second subscribe to the
// same plan ("Ya estás suscrito a este plan").

import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

const SEEDED_SUBSCRIPTION_PRODUCT_SLUG = 'cesta-mixta-huerta'

test.describe('buyer subscription checkout @smoke', () => {
  test('buyer reviews, picks address + date, confirms, lands on /cuenta/suscripciones with welcome banner', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)

    // --- PRODUCT DETAIL → navigate to confirmation page ---
    await page.goto(`/productos/${SEEDED_SUBSCRIPTION_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: /cesta mixta de huerta/i })).toBeVisible({ timeout: 10_000 })

    const subscribeCta = page.getByTestId('subscribe-to-box-cta')
    await expect(subscribeCta).toBeVisible({ timeout: 10_000 })
    await subscribeCta.click()

    // --- CONFIRMATION PAGE ---
    await expect(page).toHaveURL(/\/cuenta\/suscripciones\/nueva\?planId=/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /confirmar suscripción/i })).toBeVisible()

    // The plan summary must be visible and explicitly show the
    // recurring cadence — this is the whole point of the confirmation
    // step that the previous flow was missing.
    await expect(page.getByText(/cada semana/i).first()).toBeVisible()

    // At least one shipping address radio is rendered (seeded customer
    // already has a default address in /cuenta/direcciones).
    const addressRadios = page.getByRole('radio')
    await expect(addressRadios.first()).toBeVisible()

    // Change the first delivery date to 10 days from now — within the
    // allowed [MIN_LEAD_DAYS=2, MAX_LEAD_DAYS=60] window.
    const target = new Date()
    target.setDate(target.getDate() + 10)
    const ymd = target.toISOString().slice(0, 10)
    await page.locator('input[type="date"]').fill(ymd)

    // --- CONFIRM ---
    await page.getByTestId('confirm-subscription-submit').click()

    // --- MOCK CHECKOUT REDIRECT → SUBSCRIPTIONS PAGE ---
    // The mock adapter sends a same-origin redirect with
    // ?checkout=success&mock_session=…&planId=…&addressId=…&firstDelivery=…
    // which the page upserts + redirects again to ?welcome=1.
    await page.waitForURL(/\/cuenta\/suscripciones/, { timeout: 15_000 })

    // --- SUCCESS BANNER ---
    await expect(page.getByTestId('subscription-welcome-banner')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/suscripción activada/i)).toBeVisible()

    // --- SUBSCRIPTION ROW ---
    await expect(page.getByText(/cesta mixta de huerta/i).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/^activa$/i).first()).toBeVisible()
    await expect(page.getByText(/semanal/i).first()).toBeVisible()

    // The list must show the shipping address (line1 from seed).
    await expect(page.getByText(/calle mayor 18/i).first()).toBeVisible()

    // The empty-state message must NOT be visible anymore.
    await expect(page.getByText(/aún no tienes suscripciones/i)).not.toBeVisible()

    // Beta banner must be gone.
    await expect(page.getByText(/suscripciones en fase beta/i)).not.toBeVisible()
  })
})
