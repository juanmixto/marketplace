import { test, expect } from '@playwright/test'
import { TEST_USERS, loginAs } from './helpers/auth'

test.describe('auth @smoke', () => {
  test('customer can log in with seeded credentials', async ({ page }) => {
    await loginAs(page, TEST_USERS.customer)
    // After a successful customer login, the navbar exposes the "Mi cuenta"
    // link. Asserting on that beats asserting on a specific destination URL,
    // which is allowed to change.
    await expect(page.getByRole('link', { name: /mi cuenta|cuenta/i })).toBeVisible()
  })

  test('login with wrong credentials surfaces an error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('cliente@test.com')
    await page.getByLabel('Contraseña').fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    // Stay on /login and show an inline error message. We don't pin the
    // exact wording — just that something user-facing surfaces.
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('p.text-red-700, p.text-red-300')).toBeVisible({ timeout: 5_000 })
  })

  test('anonymous access to /vendor/dashboard redirects to /login with callbackUrl', async ({ page }) => {
    await page.goto('/vendor/dashboard')
    await expect(page).toHaveURL(/\/login\?.*callbackUrl=/)
  })

  test('anonymous access to /admin/dashboard redirects to /login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
