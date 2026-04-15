import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from '../helpers/auth'

test.describe('admin and vendor guards @smoke', () => {
  test('buyer is blocked from /admin/dashboard', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)
    await page.goto('/admin/dashboard')
    // Accept any destination except /admin/*. The exact redirect target
    // (home, login, vendor portal) is allowed to change.
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 5000 })
      .not.toMatch(/^\/admin/)
  })

  test('vendor is blocked from /admin/dashboard', async ({ page }) => {
    await loginAs(page, TEST_USERS.vendor)
    await page.goto('/admin/dashboard')
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 5000 })
      .not.toMatch(/^\/admin/)
  })

  test('buyer is blocked from /vendor/dashboard', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)
    await page.goto('/vendor/dashboard')
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 5000 })
      .not.toMatch(/^\/vendor/)
  })

  test('admin can reach /admin/dashboard', async ({ page }) => {
    await loginAs(page, TEST_USERS.admin)
    await page.goto('/admin/dashboard')
    // Sanity: admin stays on an admin route.
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 })
      .toMatch(/^\/admin/)
  })
})
