import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

// Unique per run so parallel workers never collide and stale state from a
// previously failed run never matches the selector. No explicit cleanup
// hook: the happy path ends with deletion, unique naming prevents false
// positives on re-runs, and the CI e2e-smoke job reseeds the DB between
// runs so orphans from a mid-test failure never accumulate. A Prisma
// cleanup was considered but dropped — importing `@/lib/db` from an e2e
// spec forces Playwright's loader to evaluate the Next.js module graph
// (Prisma adapter, server env) which fails with a bare-ESM error.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const BASE_NAME = `e2e-smoke Product ${RUN_ID}`
const EDITED_NAME = `e2e-smoke Product Edited ${RUN_ID}`

test.describe('vendor product CRUD @smoke', () => {
  test('vendor creates, edits and deletes a product end to end', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)

    // --- LIST ---
    await page.goto('/vendor/productos')
    await expect(page).toHaveURL(/\/vendor\/productos/)

    // --- CREATE ---
    await page.goto('/vendor/productos/nuevo')
    // Use name-attr selectors (react-hook-form `register` puts them on
    // the DOM). getByLabel is brittle here because "Unidad" collides with
    // other page chrome.
    await page.locator('input[name="name"]').fill(BASE_NAME)
    await page.locator('input[name="basePrice"]').fill('5.5')
    await page.locator('input[name="unit"]').fill('kg')
    await page.locator('input[name="stock"]').fill('10')

    // Save as draft — this path works regardless of Stripe onboarding.
    // The seeded `productor@test.com` is NOT onboarded, so "Enviar a
    // revisión" would be disabled.
    await page.getByRole('button', { name: /guardar como borrador/i }).click()

    // Backend redirects to the listing on success.
    await expect(page).toHaveURL(/\/vendor\/productos\/?$/, { timeout: 10_000 })
    const createdRow = page
      .locator('li, tr, article, div')
      .filter({ hasText: BASE_NAME })
      .first()
    await expect(createdRow).toBeVisible({ timeout: 10_000 })

    // --- EDIT ---
    // Open the action menu on the created row and click "Editar" to
    // navigate to the edit page. The edit URL includes the product id,
    // which we don't know from the DOM — the UI is our navigation.
    await createdRow.getByRole('button').last().click()
    await page.getByRole('link', { name: /^editar$/i }).first().click()
    await expect(page).toHaveURL(/\/vendor\/productos\/[^/]+$/, { timeout: 10_000 })

    const nameInput = page.locator('input[name="name"]')
    await expect(nameInput).toHaveValue(BASE_NAME, { timeout: 5_000 })
    await nameInput.fill(EDITED_NAME)
    await page.getByRole('button', { name: /guardar como borrador/i }).click()

    await expect(page).toHaveURL(/\/vendor\/productos\/?$/, { timeout: 10_000 })
    const editedRow = page
      .locator('li, tr, article, div')
      .filter({ hasText: EDITED_NAME })
      .first()
    await expect(editedRow).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(BASE_NAME)).toHaveCount(0)

    // --- DELETE ---
    // Scope the action menu lookup to the edited row so we never click the
    // wrong product's ellipsis button when multiple drafts exist.
    await editedRow.getByRole('button').last().click()
    // Menu item "Eliminar" is a plain button in the dropdown.
    await page.getByRole('button', { name: /^eliminar$/i }).first().click()
    // Confirmation modal: click the danger "Eliminar" button inside it.
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 5_000 })
    await modal.getByRole('button', { name: /^eliminar$/i }).click()

    // Modal closes and the product disappears from the list.
    await expect(modal).toBeHidden({ timeout: 5_000 })
    await expect(page.getByText(EDITED_NAME)).toHaveCount(0, { timeout: 10_000 })
  })
})
