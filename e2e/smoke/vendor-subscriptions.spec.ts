// Vendor subscription pages smoke. Previously /vendor/suscripciones and
// /vendor/suscripciones/suscriptores could render a 500 without any test
// catching it — the only subscription coverage we had was the buyer
// checkout flow, which never touched the vendor-side list queries. A
// Prisma schema change (new Subscription column) went out without the
// matching migration reaching the dev DB, and the server pages blew up
// with "column Subscription.lastStripeEventAt does not exist". This
// spec drives the two vendor pages + the plan filter so any regression
// in the read queries surfaces in @smoke CI instead of production.

import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

test.describe('vendor subscription pages @smoke', () => {
  test('vendor can load plans list and subscribers list without 500', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)

    // --- PLANS LIST ---
    const plansResponse = await page.goto('/vendor/suscripciones')
    expect(plansResponse?.status(), 'plans list must not 500').toBeLessThan(400)
    await expect(page.getByRole('heading', { name: /suscripciones/i })).toBeVisible()

    // --- SUBSCRIBERS LIST (no filter) ---
    const subsResponse = await page.goto('/vendor/suscripciones/suscriptores')
    expect(subsResponse?.status(), 'subscribers list must not 500').toBeLessThan(400)
    await expect(page.getByRole('heading', { name: /suscriptores/i })).toBeVisible()

    // --- SUBSCRIBERS LIST (plan filter) ---
    // The KPI tile linking here sends `?plan=<id>` once a plan has
    // subscribers. Using a non-existent id still exercises the exact
    // findMany({ where: { planId } }) branch that threw ColumnNotFound
    // in the original incident — the page must render empty, not 500.
    const filteredResponse = await page.goto(
      '/vendor/suscripciones/suscriptores?plan=non-existent-plan-id',
    )
    expect(filteredResponse?.status(), 'filtered subscribers list must not 500').toBeLessThan(400)
    await expect(page.getByRole('heading', { name: /suscriptores/i })).toBeVisible()
  })

  test('buyer can load /cuenta/suscripciones without 500', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)
    const response = await page.goto('/cuenta/suscripciones')
    expect(response?.status(), 'buyer subscriptions must not 500').toBeLessThan(400)
    await expect(page.getByRole('heading', { name: /mis suscripciones|suscripciones/i })).toBeVisible()
  })
})
