// Buyer subscription checkout smoke. Walks a logged-in customer from
// the product page of a box that has a seeded subscription plan, through
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
  test('buyer subscribes from product page, lands on /cuenta/suscripciones with the new row and success banner', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)

    // --- PRODUCT DETAIL ---
    await page.goto(`/productos/${SEEDED_SUBSCRIPTION_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: /cesta mixta de huerta/i })).toBeVisible({ timeout: 10_000 })

    // The subscribe CTA only renders when the plan has a stripePriceId
    // set (seeded as `price_mock_cesta_huerta`). Click it.
    const subscribeCta = page.getByRole('button', { name: /suscribirme|suscríbeme|suscribir/i })
    await expect(subscribeCta).toBeEnabled({ timeout: 10_000 })
    await subscribeCta.click()

    // --- MOCK CHECKOUT REDIRECT → SUBSCRIPTIONS PAGE ---
    // In PAYMENT_PROVIDER=mock mode the adapter returns a same-origin
    // relative URL (`/cuenta/suscripciones?checkout=success&mock_session=…
    // &planId=…&addressId=…`) which the page processes to create the
    // Subscription row and show a welcome banner. We wait for the
    // subscriptions route rather than pin the exact query string: the
    // page may land on `?welcome=1` (after its internal redirect) or on
    // the original success URL — both states render the welcome banner.
    await page.waitForURL(/\/cuenta\/suscripciones/, { timeout: 15_000 })

    // --- SUCCESS BANNER ---
    await expect(page.getByTestId('subscription-welcome-banner')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/suscripción activada/i)).toBeVisible()

    // --- SUBSCRIPTION ROW ---
    // The "Activas" section should list the cesta with a weekly badge.
    // Assert on user-visible strings — the product name and the status
    // badge — rather than DOM ids that are free to change.
    await expect(page.getByText(/cesta mixta de huerta/i).first()).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/^activa$/i).first()).toBeVisible()
    await expect(page.getByText(/semanal/i).first()).toBeVisible()

    // The empty-state message must NOT be visible anymore.
    await expect(page.getByText(/aún no tienes suscripciones/i)).not.toBeVisible()
  })
})
