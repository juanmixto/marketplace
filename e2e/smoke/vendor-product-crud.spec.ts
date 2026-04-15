import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

// Unique per run so parallel workers never collide and stale state from a
// previously failed run never matches the selector. The afterAll safety net
// below uses `RUN_ID` as its cleanup filter.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const BASE_NAME = `e2e-smoke Product ${RUN_ID}`
const EDITED_NAME = `e2e-smoke Product Edited ${RUN_ID}`

test.describe('vendor product CRUD @smoke', () => {
  test.afterAll(async () => {
    // Safety net: if any assertion failed mid-test and the UI delete step
    // never ran, wipe anything left behind so the next run starts clean.
    // Uses Prisma directly so it runs regardless of which UI step crashed.
    const { db } = await import('@/lib/db')
    await db.product.deleteMany({
      where: { name: { contains: RUN_ID } },
    })
  })

  test('vendor creates, edits and deletes a product end to end', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)

    // --- LIST ---
    await page.goto('/vendor/productos')
    await expect(page).toHaveURL(/\/vendor\/productos/)

    // --- CREATE ---
    await page.goto('/vendor/productos/nuevo')
    await page.getByLabel('Nombre').fill(BASE_NAME)
    await page.getByLabel('Precio base').fill('5.5')
    await page.getByLabel('Unidad').fill('kg')
    await page.getByLabel('Stock').fill('10')

    // Save as draft — this path works for both stripeOnboarded and non-
    // onboarded vendors. The seeded `productor@test.com` is NOT onboarded,
    // so "Enviar a revisión" would be disabled here.
    await page.getByRole('button', { name: /guardar como borrador/i }).click()

    // Backend redirects to the listing on success.
    await expect(page).toHaveURL(/\/vendor\/productos\/?$/, { timeout: 10_000 })
    await expect(page.getByText(BASE_NAME)).toBeVisible({ timeout: 10_000 })

    // --- EDIT ---
    // Look up the new product's id via Prisma rather than scraping the DOM;
    // the listing does not expose the id as a stable selector.
    const { db } = await import('@/lib/db')
    const created = await db.product.findFirst({
      where: { name: BASE_NAME },
      select: { id: true },
    })
    expect(created, 'created product should exist in DB').not.toBeNull()

    await page.goto(`/vendor/productos/${created!.id}`)
    const nameInput = page.getByLabel('Nombre')
    await expect(nameInput).toHaveValue(BASE_NAME)
    await nameInput.fill(EDITED_NAME)
    await page.getByRole('button', { name: /guardar como borrador/i }).click()

    await expect(page).toHaveURL(/\/vendor\/productos\/?$/, { timeout: 10_000 })
    await expect(page.getByText(EDITED_NAME)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(BASE_NAME)).toHaveCount(0)

    // --- DELETE ---
    // The row for our edited product sits inside the listing. Scope the
    // action menu lookup to that row so we never click the wrong product's
    // ellipsis button when multiple drafts exist.
    const productRow = page
      .locator('li, tr, article, div')
      .filter({ hasText: EDITED_NAME })
      .first()
    // ProductActions renders a single round icon-button with no accessible
    // name. `button` with no name inside the scoped row is unique enough.
    await productRow.getByRole('button').last().click()
    // Menu item "Eliminar" appears as a plain button — not inside a dialog.
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
