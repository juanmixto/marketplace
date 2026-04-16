// Buyer subscription checkout smoke. Walks a logged-in customer from
// the product page of a box that has TWO seeded subscription plans
// (weekly + biweekly), through the confirmation form (cadence selector
// + address + first-delivery date picker), through the mock Stripe
// checkout redirect, to the /cuenta/suscripciones page where the new
// row must show up with a welcome banner. Then exercises the
// "Cambiar fecha" (reschedule) flow.
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
  test('buyer picks cadence + date, confirms, lands on list, reschedules next delivery', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)

    // --- PRODUCT DETAIL → navigate to confirmation page ---
    await page.goto(`/productos/${SEEDED_SUBSCRIPTION_PRODUCT_SLUG}`)
    await expect(page.getByRole('heading', { name: /cesta mixta de huerta/i })).toBeVisible({ timeout: 10_000 })

    const subscribeCta = page.getByTestId('subscribe-to-box-cta')
    await expect(subscribeCta).toBeVisible({ timeout: 10_000 })
    await subscribeCta.click()

    // --- CONFIRMATION PAGE ---
    // The new flow navigates with ?productId=… (not ?planId=…) so the
    // page can show a cadence selector.
    await expect(page).toHaveURL(/\/cuenta\/suscripciones\/nueva\?productId=/, { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /confirmar suscripción/i })).toBeVisible()

    // --- CADENCE SELECTOR ---
    // Seed publishes BOTH weekly and biweekly for the cesta. Picking
    // biweekly verifies that the buyer actually controls the frequency.
    await expect(page.getByTestId('cadence-option-WEEKLY')).toBeVisible()
    await expect(page.getByTestId('cadence-option-BIWEEKLY')).toBeVisible()
    await page.getByTestId('cadence-option-BIWEEKLY').click()

    // Address radio from the seed customer.
    const addressRadios = page.getByRole('radio', { name: /calle mayor/i })
    await expect(addressRadios.first()).toBeVisible()

    // First delivery date → 10 days from now (inside [+2d, +60d]).
    const target10 = new Date()
    target10.setDate(target10.getDate() + 10)
    const ymd10 = target10.toISOString().slice(0, 10)
    await page.locator('input[type="date"]').fill(ymd10)

    // --- CONFIRM ---
    await page.getByTestId('confirm-subscription-submit').click()

    // --- SUBSCRIPTIONS LIST ---
    await page.waitForURL(/\/cuenta\/suscripciones/, { timeout: 15_000 })
    await expect(page.getByTestId('subscription-welcome-banner')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/cesta mixta de huerta/i).first()).toBeVisible()
    await expect(page.getByText(/^activa$/i).first()).toBeVisible()
    // Must now be Quincenal — we picked biweekly.
    await expect(page.getByText(/quincenal/i).first()).toBeVisible()
    // Shipping address from seed (Calle Mayor 18).
    await expect(page.getByText(/calle mayor 18/i).first()).toBeVisible()
    // Beta banner must be gone.
    await expect(page.getByText(/suscripciones en fase beta/i)).not.toBeVisible()

    // --- RESCHEDULE NEXT DELIVERY ---
    // Open the dialog, pick a new date 20 days out, save. Verify the
    // list re-renders with the new date.
    //
    // CI flake fix (2026-04-16): wait for the network + React hydration to
    // settle before clicking. The prod build on CI sometimes hydrates the
    // SubscriptionRow late enough that Playwright clicks a button that
    // still has no onClick handler attached, so `setRescheduleOpen(true)`
    // never fires and the dialog never mounts. Waiting for networkidle
    // gives React time to hydrate, and `toBeEnabled` re-locates the
    // element post-hydration.
    await page.waitForLoadState('networkidle')
    const rescheduleCta = page.getByTestId('reschedule-subscription-cta')
    await expect(rescheduleCta).toBeEnabled({ timeout: 10_000 })
    await rescheduleCta.click()
    await expect(page.getByTestId('reschedule-subscription-dialog')).toBeVisible({ timeout: 10_000 })

    const target20 = new Date()
    target20.setDate(target20.getDate() + 20)
    const ymd20 = target20.toISOString().slice(0, 10)
    await page.getByTestId('reschedule-subscription-date').fill(ymd20)
    await page.getByTestId('reschedule-subscription-save').click()

    // Dialog closes (no more dialog on screen).
    await expect(page.getByTestId('reschedule-subscription-dialog')).toHaveCount(0, { timeout: 10_000 })

    // And the row's next-delivery line shows the new date. Format comes
    // from Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }) — e.g.
    // "6 may 2026". We scope to the subscription-next-delivery testid so
    // we don't collide with the footer year, and match "<day> <month>"
    // so the regex remains stable regardless of the current date.
    const day = target20.getDate()
    const monthEs = target20.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')
    await expect(page.getByTestId('subscription-next-delivery').first()).toContainText(
      new RegExp(`${day}\\s+${monthEs}`, 'i'),
      { timeout: 10_000 },
    )
  })
})
